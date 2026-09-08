import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { png } from './png-fixture.mjs';
import { createHash } from 'node:crypto';
import createTileStorage from '../src/tile-storage.js';
import { createBucketFromR2 } from '../worker/store.js';
import { validatePng, validatePngData, uploadSpec, readBounded, MAX_TILE_BYTES } from '../worker/tile-upload.js';
import { workerFixture, seed, tokens } from './helpers.mjs';

function memoryR2() {
  const objects = new Map();
  return {
    objects,
    async list({ prefix = '' } = {}) { return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, o]) => ({ key, etag: o.etag })), truncated: false }; },
    async head(key) { return objects.get(key) || null; },
    async get(key) { const o = objects.get(key); return o ? { ...o, arrayBuffer: async () => o.bytes } : null; },
    async put(key, bytes, options) {
      const old = objects.get(key); const condition = options.onlyIf;
      if (condition.etagDoesNotMatch === '*' && old || condition.etagMatches && condition.etagMatches !== old?.etag) return null;
      const value = { bytes, etag: createHash('sha256').update(bytes).digest('hex'), httpMetadata: options.httpMetadata };
      objects.set(key, value); return value;
    },
  };
}
for (const storage of ['R2', 'filesystem']) test(`${storage}: authenticated add, replace, conflict and dimension isolation`, async t => {
  let bucket;
  if (storage === 'R2') bucket = createBucketFromR2(memoryR2());
  else {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-tiles-')); t.after(() => rm(dir, { recursive: true, force: true }));
    bucket = createTileStorage(dir);
    await writeFile(join(dir, '3_16_x1024_z0.png'), png());
  }
  const { app, db, req } = await workerFixture(t, { bucket }); await seed(db);
  const upload = (query, token = tokens.admin, body = png(), etag) => app(new Request('https://test.invalid/api/tiles?' + query, {
    method: 'PUT', headers: { 'content-type': 'image/png', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(etag ? { 'if-match': etag } : {}) }, body,
  }));
  const q = 'world=overworld&name=x0_z0.png&mode=add';
  assert.equal((await upload(q, null)).status, 401);
  assert.equal((await upload(q, tokens.alice)).status, 403);
  assert.equal((await upload(q, 'bad')).status, 403);
  const added = await upload(q); assert.equal(added.status, 201); const first = await added.json();
  assert.equal((await upload(q)).status, 409);
  const replace = q.replace('mode=add', 'mode=replace');
  assert.equal((await upload(replace)).status, 409);
  assert.equal((await upload(replace, tokens.admin, png(1), 'stale')).status, 409);
  const changed = await upload(replace, tokens.owner, png(1), first.version); assert.equal(changed.status, 200);
  const second = await changed.json(); assert.notEqual(second.version, first.version);
  assert.equal((await upload(replace, tokens.admin, png(2), first.version)).status, 409);
  const index = await req('GET', '/api/tiles');
  assert.equal(index.headers.get('cache-control'), 'no-store');
  assert.equal(index.data.filter(t => t.x === 0 && t.z === 0).length, 1);
  assert.equal(index.data.find(t => t.x === 0).url, second.url);
  const served = await app(new Request('https://test.invalid' + second.url)); assert.deepEqual(Buffer.from(await served.arrayBuffer()), png(1));
  assert.equal((await upload('world=end&name=x0_z0.png&mode=add')).status, 201);
  assert.equal((await req('GET', '/api/tiles?world=end')).data.length, 1);
  assert.equal((await upload('world=end&name=x5_z5.png&mode=replace')).status, 404);
  await db.run("UPDATE users SET role = 'user' WHERE id = 2");
  assert.equal((await upload('world=end&name=x6_z6.png&mode=add')).status, 403);
  assert.equal((await req('GET', '/api/me', undefined, tokens.admin)).data.role, 'user');
  await db.run('DELETE FROM users WHERE id = 2'); assert.equal((await upload(q)).status, 403);
  if (storage === 'filesystem') {
    const old = await upload('world=overworld&name=x1024_z0.png&mode=replace', tokens.owner); assert.equal(old.status, 200);
    const list = (await req('GET', '/api/tiles')).data; assert.equal(list.filter(t => t.x === 1024).length, 1);
  }
  const race = await Promise.all([upload('world=end&name=x10_z10.png&mode=add', tokens.owner), upload('world=end&name=x10_z10.png&mode=add', tokens.owner)]);
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
});
test('upload validation rejects malformed files, paths, dimensions, size and chunk corruption', async t => {
  for (const name of ['../x0_z0.png', 'x0_z0.svg', 'x30000001_z0.png', 'x999999999999999999_z0.png']) assert.throws(() => uploadSpec('https://test/?mode=add&name=' + name));
  for (const world of ['../', 'unknown']) assert.throws(() => uploadSpec(`https://test/?mode=add&name=x0_z0.png&world=${world}`));
  assert.throws(() => uploadSpec('https://test/?mode=delete&name=x0_z0.png'));
  validatePng(png());
  await validatePngData(png());
  await assert.rejects(validatePngData(png(0, true)), e => e.status === 400);
  const damaged = png(); damaged[30] ^= 1;
  for (const bytes of [new Uint8Array(), png().subarray(0, 30), Buffer.from('not a png'), damaged, Buffer.concat([png(), Buffer.from('extra')])]) assert.throws(() => validatePng(bytes));
  assert.throws(() => validatePng(new Uint8Array(MAX_TILE_BYTES + 1)), e => e.status === 413);
  await assert.rejects(readBounded(new Request('https://test/', { method: 'PUT', body: 'x', headers: { 'content-length': String(MAX_TILE_BYTES + 1) } })), e => e.status === 413);
  await assert.rejects(readBounded(new Request('https://test/', { method: 'PUT' })), e => e.status === 400);
  await assert.rejects(readBounded(new Request('https://test/', { method: 'PUT', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_TILE_BYTES + 1)); c.close(); } }), duplex: 'half' })), e => e.status === 413);
  const { app, db } = await workerFixture(t, { bucket: createBucketFromR2(memoryR2()) }); await seed(db);
  const response = await app(new Request('https://test.invalid/api/tiles?name=x0_z0.png&mode=add', { method: 'PUT', headers: { authorization: 'Bearer ' + tokens.owner, 'content-type': 'image/png' }, body: damaged }));
  assert.equal(response.status, 400); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
