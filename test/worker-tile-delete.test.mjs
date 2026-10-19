import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import createTileStorage from '../src/tile-storage.js';
import { createBucketFromR2 } from '../worker/store.js';
import { png } from './png-fixture.mjs';
import { workerFixture, seed, tokens } from './helpers.mjs';

// 独立的内存 R2：只实现 store.js 适配器与删除接口需要的子集
function memoryR2(initial) {
  const objects = new Map(Object.entries(initial).map(([key, bytes]) => [key, { bytes, etag: createHash('sha256').update(bytes).digest('hex'), httpMetadata: { contentType: 'image/png' } }]));
  return {
    objects,
    async list({ prefix = '' } = {}) {
      return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, o]) => ({ key, etag: o.etag })), truncated: false };
    },
    async head(key) { return objects.get(key) || null; },
    async get(key) { const o = objects.get(key); return o ? { ...o, arrayBuffer: async () => o.bytes } : null; },
    async delete(key) { objects.delete(key); },
  };
}

const OVERLAY = '_uploads/overworld/x0_z0.png';
const NETHER_BASE = 'nether/x-7_z8.png';
const NETHER_OVERLAY = '_uploads/nether/x1_z2.png';
const END_BASE = 'end/x3_z4.png';
const END_OVERLAY = '_uploads/end/x5_z5.png';
const FIXTURE_KEYS = [OVERLAY, NETHER_BASE, NETHER_OVERLAY, END_BASE, END_OVERLAY];

async function fixtureFor(t, storage) {
  if (storage === 'R2') {
    const r2 = memoryR2(Object.fromEntries(FIXTURE_KEYS.map(key => [key, png()])));
    return { bucket: createBucketFromR2(r2), r2 };
  }
  const dir = await mkdtemp(join(tmpdir(), 'atlas-delete-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bucket = createTileStorage(dir);
  for (const key of FIXTURE_KEYS) await bucket.putTile(key, png(), null);
  return { bucket, dir };
}

// 同时覆盖根目录与各维度/覆盖层目录，R2 与目录实现返回结构一致
const SCOPES = ['', 'nether/', 'end/', '_uploads/overworld/', '_uploads/nether/', '_uploads/end/'];
async function snapshot(bucket) {
  const keys = new Set();
  for (const prefix of SCOPES) for (const o of await bucket.listTiles(prefix)) keys.add(o.key);
  return [...keys].sort();
}

for (const storage of ['R2', 'filesystem']) {
  test(`${storage}: tile delete enforces auth, roles, overlay-then-base order and safe paths`, async t => {
    const { bucket, r2 } = await fixtureFor(t, storage);
    const { app, db, req } = await workerFixture(t, { bucket });
    await seed(db);
    const exists = async key => Boolean(await bucket.headTile(key));
    const del = (query, token) => app(new Request('https://test.invalid/api/tiles?' + query, {
      method: 'DELETE', headers: token ? { authorization: 'Bearer ' + token } : {},
    }));

    // 未登录 / 普通用户 / 无效 token
    assert.equal((await del('world=overworld&name=x0_z0.png')).status, 401);
    const forbidden = await del('world=overworld&name=x0_z0.png', tokens.alice);
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { error: '权限不足' });
    assert.equal((await del('world=overworld&name=x0_z0.png', 'bad')).status, 403);
    assert.equal(await exists(OVERLAY), true, '无权限的请求不得删除任何对象');

    // admin 删除上传覆盖层，removed='upload'
    const uploaded = await del('world=overworld&name=x0_z0.png', tokens.admin);
    assert.equal(uploaded.status, 200);
    assert.deepEqual(await uploaded.json(), { ok: true, removed: 'upload', world: 'overworld', x: 0, z: 0 });
    assert.equal(await exists(OVERLAY), false);
    assert.equal((await req('GET', '/api/tiles')).data.some(t => t.x === 0 && t.z === 0), false);

    // owner 删除基础层，removed='base'，且不波及其它维度/覆盖层
    const before = await snapshot(bucket);
    const base = await del('world=nether&name=x-7_z8.png', tokens.owner);
    assert.equal(base.status, 200);
    assert.deepEqual(await base.json(), { ok: true, removed: 'base', world: 'nether', x: -7, z: 8 });
    assert.equal(await exists(NETHER_BASE), false);
    assert.equal(await exists(NETHER_OVERLAY), true);
    assert.equal(await exists(END_BASE), true);
    assert.equal(await exists(END_OVERLAY), true);
    assert.deepEqual(await snapshot(bucket), before.filter(k => k !== NETHER_BASE));

    // 既有命名格式都应解析到同一坐标：先 x5z5.png 删上传层，再 3_16_x5_z5.png 已无对象 → 404
    assert.equal((await del('world=end&name=x5z5.png', tokens.admin)).status, 200);
    assert.equal(await exists(END_OVERLAY), false);
    assert.equal((await del('world=end&name=3_16_x5_z5.png', tokens.admin)).status, 404);

    // 两层都不存在 → 404
    const missing = await del('world=end&name=x404_z404.png', tokens.admin);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: '瓦片不存在' });

    // 非法文件名 / 非法维度 / 路径穿越 → 400，且不产生任何删除
    const safe = await snapshot(bucket);
    for (const name of ['../x0_z0.png', 'x1_z2.png/../../nether/x-7_z8.png', 'notatile.png', 'x0_z0.svg', 'x999999999999999999_z0.png']) {
      assert.equal((await del('world=overworld&name=' + encodeURIComponent(name), tokens.admin)).status, 400, name);
    }
    for (const world of ['abc', '..%2F', 'nether%2F']) {
      assert.equal((await del('world=' + world + '&name=x1_z2.png', tokens.admin)).status, 400, world);
    }
    assert.deepEqual(await snapshot(bucket), safe, '非法请求不得删除任何对象');

    // 维度隔离：主世界请求不能删除 nether/ 前缀下的对象
    assert.equal((await del('world=overworld&name=x1_z2.png', tokens.admin)).status, 404);
    assert.equal(await exists(NETHER_OVERLAY), true);

    // 数据库里已被降权的 admin，旧 token 不能继续删除
    await db.run("UPDATE users SET role = 'user' WHERE id = 2");
    assert.equal((await del('world=nether&name=x1_z2.png', tokens.admin)).status, 403);
    assert.equal(await exists(NETHER_OVERLAY), true);
    await db.run("UPDATE users SET role = 'admin' WHERE id = 2");
    assert.equal((await del('world=nether&name=x1_z2.png', tokens.admin)).status, 200);
    assert.equal(await exists(NETHER_OVERLAY), false);

    // 四个目标对象已删除，其余对象原样保留
    assert.deepEqual(await snapshot(bucket), [END_BASE]);
    if (r2) assert.deepEqual([...r2.objects.keys()], [END_BASE]);
  });
}

test('deleteTile rejects traversal outside the tile root on the filesystem adapter', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-delete-guard-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bucket = createTileStorage(dir);
  await bucket.putTile('_uploads/overworld/x0_z0.png', png(), null);
  const backslash = String.fromCharCode(92);
  for (const key of ['../escape.png', '_uploads/../../escape.png', '_uploads' + backslash + 'overworld' + backslash + 'x0_z0.png']) {
    await assert.rejects(bucket.deleteTile(key), /Invalid tile path/);
  }
  assert.equal(await bucket.deleteTile('_uploads/overworld/x0_z0.png'), true);
  assert.equal(await bucket.deleteTile('_uploads/overworld/x0_z0.png'), false);
});
