// 历程记录（博客式相册）：帖子 CRUD + 图片上传/读取。
// 与瓦片一样保持"零依赖 + 两个运行时共用"：Worker 直接调用，Express 版
// （src/routes/posts.js）用同一批 handler，只把 db/bucket 换成 sqlite3/目录实现。
// 存储键：<postId>/<随机>.<ext>，对外 URL 为 /photos/<key>。
import { authenticateReq, json } from './routes.js';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_POST = 12;
export const MAX_TITLE = 80;
export const MAX_BODY = 5000;
const PHOTO_KEY_RE = /^\d{1,10}\/[A-Za-z0-9_-]{8,64}\.(png|jpg|jpeg|webp)$/;

// ---------- 图片识别 ----------
// 只认真正的文件头（不信任 Content-Type）：返回 { type, ext, width, height }，无法识别返回 null。
export function imageInfo(bytes) {
  if (!bytes || bytes.length < 16) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG：签名 + 首个块必须是 IHDR，宽高在 16/20 字节处（大端）
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
    if (bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return null;
    const width = view.getUint32(16), height = view.getUint32(20);
    if (!width || !height) return null;
    return { type: 'image/png', ext: 'png', width, height };
  }

  // JPEG：逐段扫描到 SOF0/1/2/3/5-7/9-11/13-15，宽高在段内
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const size = (bytes[i + 2] << 8) | bytes[i + 3];
      if (size < 2) return null;
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        if (!width || !height) return null;
        return { type: 'image/jpeg', ext: 'jpg', width, height };
      }
      i += 2 + size;
    }
    return null;
  }

  // WebP：RIFF....WEBP，按第一个块区分有损 (VP8 ) / 无损 (VP8L) / 扩展 (VP8X)
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { type: 'image/webp', ext: 'webp', width, height };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
      const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
      return { type: 'image/webp', ext: 'webp', width, height };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const width = ((bytes[26] | (bytes[27] << 8)) & 0x3fff);
      const height = ((bytes[28] | (bytes[29] << 8)) & 0x3fff);
      if (!width || !height) return null;
      return { type: 'image/webp', ext: 'webp', width, height };
    }
    return null;
  }
  return null;
}

// 有界读取请求体（与瓦片上传同思路，超限立即中断）
export async function readPhotoBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_PHOTO_BYTES) throw { status: 413, msg: '图片不能超过 10 MB' };
  if (!request.body) throw { status: 400, msg: '请选择图片文件' };
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PHOTO_BYTES) { await reader.cancel(); throw { status: 413, msg: '图片不能超过 10 MB' }; }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}

function photoUrl(key) {
  return '/photos/' + key.split('/').map(encodeURIComponent).join('/');
}

function cleanName(name) {
  const base = String(name || '').replace(/^.*[\\/]/, '').replace(/\s+/g, ' ').trim();
  return base.slice(0, 80) || '图片';
}

function toPost(row, photos) {
  return {
    id: row.id,
    title: row.title,
    body: row.body || '',
    author: row.author,
    images: photos.map(p => ({ key: p.key, url: photoUrl(p.key), name: p.name || '图片', width: p.width || 0, height: p.height || 0 })),
    created_at: row.created_at,
    updated_at: row.updated_at || null,
  };
}

async function photosFor(db, rows) {
  if (!rows.length) return new Map();
  const ids = rows.map(r => r.id);
  const marks = ids.map(() => '?').join(',');
  const photos = await db.query(`SELECT post_id, key, name, width, height FROM post_photos WHERE post_id IN (${marks}) ORDER BY id ASC`, ids);
  const map = new Map(ids.map(id => [id, []]));
  for (const p of photos) {
    const list = map.get(p.post_id);
    if (list) list.push(p);
  }
  return map;
}

// 写权限：作者本人或 admin/owner（角色以数据库当前值为准，旧 token 不保留提权）
async function assertCanManage(ctx, user, post) {
  const current = await ctx.db.get('SELECT role FROM users WHERE id = ?', [user.id]);
  const privileged = current && ['admin', 'owner'].includes(current.role);
  if (post.author_id !== user.id && post.author !== user.username && !privileged) throw { status: 403, msg: '无权修改这篇记录' };
}

// ---------- 帖子 ----------
export async function listPosts(req, ctx) {
  const q = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number.parseInt(q.get('limit'), 10) || 24, 1), 60);
  const offset = Math.max(Number.parseInt(q.get('offset'), 10) || 0, 0);
  const rows = await ctx.db.query('SELECT * FROM posts ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
  const total = await ctx.db.get('SELECT COUNT(*) AS c FROM posts');
  const photos = await photosFor(ctx.db, rows);
  const response = json({ total: total ? total.c : 0, limit, offset, items: rows.map(row => toPost(row, photos.get(row.id) || [])) });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function getPost(req, ctx) {
  const row = await ctx.db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!row) return json({ error: '记录不存在' }, 404);
  const photos = await photosFor(ctx.db, [row]);
  const response = json(toPost(row, photos.get(row.id) || []));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function createPost(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body : '';
  if (!title) return json({ error: '标题不能为空' }, 400);
  if (title.length > MAX_TITLE) return json({ error: `标题不能超过 ${MAX_TITLE} 个字` }, 400);
  if (text.length > MAX_BODY) return json({ error: `正文不能超过 ${MAX_BODY} 个字` }, 400);
  const res = await ctx.db.run('INSERT INTO posts (title, body, author, author_id) VALUES (?, ?, ?, ?)', [title, text, user.username, user.id]);
  const row = await ctx.db.get('SELECT * FROM posts WHERE id = ?', [res.lastRowId]);
  return json(toPost(row, []), 201);
}

export async function updatePost(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const row = await ctx.db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!row) return json({ error: '记录不存在' }, 404);
  await assertCanManage(ctx, user, row);
  const body = await req.json().catch(() => ({}));
  const title = body.title === undefined ? row.title : (typeof body.title === 'string' ? body.title.trim() : '');
  const text = body.body === undefined ? row.body : (typeof body.body === 'string' ? body.body : null);
  if (!title) return json({ error: '标题不能为空' }, 400);
  if (title.length > MAX_TITLE) return json({ error: `标题不能超过 ${MAX_TITLE} 个字` }, 400);
  if (text === null) return json({ error: '正文格式无效' }, 400);
  if (text.length > MAX_BODY) return json({ error: `正文不能超过 ${MAX_BODY} 个字` }, 400);
  await ctx.db.run('UPDATE posts SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, text, row.id]);
  const fresh = await ctx.db.get('SELECT * FROM posts WHERE id = ?', [row.id]);
  const photos = await photosFor(ctx.db, [fresh]);
  return json(toPost(fresh, photos.get(fresh.id) || []));
}

export async function deletePost(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const row = await ctx.db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!row) return json({ error: '记录不存在' }, 404);
  await assertCanManage(ctx, user, row);
  const photos = await ctx.db.query('SELECT key FROM post_photos WHERE post_id = ?', [row.id]);
  for (const photo of photos) {
    try { await ctx.bucket.deletePhoto(photo.key); } catch { /* 图片已丢失不影响删除记录 */ }
  }
  await ctx.db.run('DELETE FROM post_photos WHERE post_id = ?', [row.id]);
  await ctx.db.run('DELETE FROM posts WHERE id = ?', [row.id]);
  return json({ ok: true, removed: photos.length });
}

// ---------- 图片 ----------
export async function uploadPhoto(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const row = await ctx.db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!row) return json({ error: '记录不存在' }, 404);
  await assertCanManage(ctx, user, row);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) return json({ error: '仅支持 PNG / JPEG / WebP 图片' }, 415);
  const count = await ctx.db.get('SELECT COUNT(*) AS c FROM post_photos WHERE post_id = ?', [row.id]);
  if (count && count.c >= MAX_PHOTOS_PER_POST) return json({ error: `每篇最多 ${MAX_PHOTOS_PER_POST} 张图片` }, 400);
  const bytes = await readPhotoBody(req);
  const info = imageInfo(bytes);
  if (!info) return json({ error: '图片文件无效，请换一张图片重试' }, 400);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const key = `${row.id}/${rand}.${info.ext}`;
  const name = cleanName(new URL(req.url).searchParams.get('name'));
  await ctx.bucket.putPhoto(key, bytes, info.type);
  const res = await ctx.db.run('INSERT INTO post_photos (post_id, key, name, width, height) VALUES (?, ?, ?, ?, ?)', [row.id, key, name, info.width, info.height]);
  return json({ id: res.lastRowId, key, url: photoUrl(key), name, width: info.width, height: info.height }, 201);
}

export async function deletePhoto(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const row = await ctx.db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!row) return json({ error: '记录不存在' }, 404);
  await assertCanManage(ctx, user, row);
  const key = new URL(req.url).searchParams.get('key') || '';
  if (!key.startsWith(row.id + '/') || !PHOTO_KEY_RE.test(key)) return json({ error: '图片不存在' }, 404);
  const photo = await ctx.db.get('SELECT * FROM post_photos WHERE post_id = ? AND key = ?', [row.id, key]);
  if (!photo) return json({ error: '图片不存在' }, 404);
  await ctx.bucket.deletePhoto(key);
  await ctx.db.run('DELETE FROM post_photos WHERE id = ?', [photo.id]);
  return json({ ok: true });
}

export async function servePhoto(req, ctx) {
  const key = req.params.key;
  if (!PHOTO_KEY_RE.test(key)) return json({ error: 'Not Found' }, 404);
  const photo = await ctx.bucket.getPhoto(key);
  if (!photo) return json({ error: 'Not Found' }, 404);
  return new Response(photo.buf, {
    headers: { 'Content-Type': photo.type, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' },
  });
}
