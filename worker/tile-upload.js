import { authenticateReq, json } from './routes.js';

export const MAX_TILE_BYTES = 8 * 1024 * 1024;
export const WORLDS = ['overworld', 'nether', 'end'];
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
export function tileCoords(name) {
  const m = /^(?:\d+_\d+_)?[xX](-?\d+)_?[zZ](-?\d+)\.(png|jpg|webp)$/.exec(name);
  if (!m || ![m[1], m[2]].every(v => Number.isSafeInteger(Number(v)) && Math.abs(Number(v)) <= 30000000)) return null;
  return { x: Number(m[1]), z: Number(m[2]) };
}
export function uploadSpec(url) {
  const q = new URL(url).searchParams;
  const world = q.get('world') || 'overworld', mode = q.get('mode');
  const coords = tileCoords(q.get('name') || '');
  if (!WORLDS.includes(world) || !coords || !q.get('name').endsWith('.png') || !['add', 'replace'].includes(mode)) throw { status: 400, msg: '维度、文件名或操作无效' };
  return { world, mode, ...coords, key: `_uploads/${world}/x${coords.x}_z${coords.z}.png` };
}
// Validate complete PNG chunk framing and CRCs, not just a MIME label or signature.
export function validatePng(bytes) {
  const fail = () => { throw { status: 400, msg: '需要完整的 1024×1024 PNG 瓦片' }; };
  if (bytes.length > MAX_TILE_BYTES) throw { status: 413, msg: '瓦片不能超过 8 MB' };
  if (bytes.length < 57 || ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) fail();
  let offset = 8, data = false, end = false;
  let palette = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), stop = offset + 12 + length;
    if (stop > bytes.length) fail();
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || (type[0] === type[0].toUpperCase() && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type))) fail();
    if (type === 'IHDR' && offset !== 8) fail();
    if (offset === 8 && (type !== 'IHDR' || length !== 13 || view.getUint32(16) !== 1024 || view.getUint32(20) !== 1024)) fail();
    let crc = 0xffffffff;
    for (let i = offset + 4; i < stop - 4; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 255];
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(stop - 4)) fail();
    if (type === 'IDAT' && length > 0) data = true;
    if (type === 'PLTE') { if (data || !length || length % 3 || length > 768) fail(); palette = true; }
    if (type === 'IEND') { if (length !== 0 || stop !== bytes.length) fail(); end = true; }
    offset = stop;
  }
  if (!data || !end || offset !== bytes.length || (bytes[25] === 3 && !palette)) fail();
}
// Bound decompression by the expected PNG scanlines, including Adam7 passes.
// This catches valid-CRC files containing broken/oversized compressed payloads.
export async function validatePngData(bytes) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[bytes[25]];
  const bits = channels * bytes[24];
  const passes = bytes[28] === 0 ? [[0, 0, 1, 1]] : [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
  let expected = 0; const filters = [];
  for (const [x, y, dx, dy] of passes) {
    const rowSize = 1 + Math.ceil(Math.ceil((1024 - x) / dx) * bits / 8);
    for (let row = y; row < 1024; row += dy) { filters.push(expected); expected += rowSize; }
  }
  const parts = []; const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset < bytes.length;) {
    const size = view.getUint32(offset);
    if (String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === 'IDAT') parts.push(bytes.slice(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const reader = new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let seen = 0, filterIndex = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      if (seen + value.length > expected) throw new Error('Oversized pixels');
      while (filterIndex < filters.length && filters[filterIndex] < seen + value.length) {
        if (value[filters[filterIndex++] - seen] > 4) throw new Error('Invalid filter');
      }
      seen += value.length;
    }
    if (seen !== expected) throw new Error('Truncated pixels');
  } catch {
    await reader.cancel().catch(() => {});
    throw { status: 400, msg: 'PNG 像素数据无效，请重新导出瓦片' };
  } finally { reader.releaseLock(); }
}
export async function readBounded(request) {
  if (Number(request.headers.get('content-length')) > MAX_TILE_BYTES) throw { status: 413, msg: '瓦片不能超过 8 MB' };
  if (!request.body) throw { status: 400, msg: '请选择 PNG 文件' };
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_TILE_BYTES) { await reader.cancel(); throw { status: 413, msg: '瓦片不能超过 8 MB' }; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}
export async function uploadTile(request, ctx) {
  const { user } = await authenticateReq(request, ctx);
  // Never authorize a destructive operation using a potentially stale JWT role.
  const current = await ctx.db.get('SELECT role FROM users WHERE id = ?', [user.id]);
  if (!current || !['admin', 'owner'].includes(current.role)) return json({ error: '仅管理员或 Owner 可上传瓦片' }, 403);
  if (request.headers.get('content-type')?.split(';')[0] !== 'image/png') return json({ error: '需要 image/png 请求体' }, 415);
  const spec = uploadSpec(request.url);
  const bytes = await readBounded(request); validatePng(bytes);
  await validatePngData(bytes);
  const prefix = spec.world === 'overworld' ? '' : spec.world + '/';
  const base = await ctx.bucket.listTiles(prefix);
  const exists = base.some(o => {
    if (o.key.slice(prefix.length).includes('/')) return false;
    const c = tileCoords(o.key.slice(prefix.length));
    return c && c.x === spec.x && c.z === spec.z;
  });
  const overlay = await ctx.bucket.headTile(spec.key);
  if (spec.mode === 'add' && (exists || overlay)) return json({ error: '此坐标已有瓦片，请选择替换' }, 409);
  if (spec.mode === 'replace' && !exists && !overlay) return json({ error: '此坐标没有瓦片，请选择新增' }, 404);
  if (overlay && request.headers.get('if-match') !== overlay.etag) return json({ error: '瓦片已更新，请刷新预览后重试' }, 409);
  const result = await ctx.bucket.putTile(spec.key, bytes, overlay?.etag || null, String(user.id));
  if (!result) return json({ error: '瓦片已被其他管理员更新，请刷新后重试' }, 409);
  return json({ x: spec.x, z: spec.z, world: spec.world, version: result.etag, url: `/tiles/${spec.key}?v=${encodeURIComponent(result.etag)}` }, spec.mode === 'add' ? 201 : 200);
}
