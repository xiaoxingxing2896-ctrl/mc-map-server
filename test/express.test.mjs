import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiContract } from './api-contract.mjs';
import { secret, seed, tileFiles, tokens } from './helpers.mjs';
import { createDbFromSqlite } from '../worker/dev-shims.js';

const dir = mkdtempSync(join(tmpdir(), 'mc-map-test-'));
Object.assign(process.env, { DB_PATH: ':memory:', TILES_DIR: dir, JWT_SECRET: secret, ADMIN_PASSWORD: 'TestPass123', TRUST_PROXY: '1' });
for (const f of tileFiles) writeFileSync(join(dir, f), Buffer.from([137, 80, 78, 71]));
const require = createRequire(import.meta.url);
const config = require('../config');
// config resolves paths, so explicitly use SQLite's in-memory name before loading db.
config.dbPath = ':memory:';
const { app } = require('../server');
const { db: raw, initDatabase } = require('../src/db');
const db = createDbFromSqlite(raw);
let server, base, seq = 0;
before(async () => {
  await initDatabase();
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise((resolve, reject) => raw.close(e => e ? reject(e) : resolve()));
  rmSync(dir, { recursive: true, force: true });
});
async function req(method, path, body, token, extra = {}) {
  const r = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.${Math.floor(++seq / 250)}.${seq % 250 + 1}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, headers: r.headers, data };
}
async function fixture() {
  await db.run('DELETE FROM markers'); await db.run('DELETE FROM users'); await seed(db);
  return { req, db };
}
apiContract(test, fixture);

test('register, duplicate username, login and credential replacement', async () => {
  await fixture();
  for (const body of [{ username: 'ab', password: '1234' }, { username: 'a'.repeat(33), password: '1234' }, { username: 'valid', password: '123' }]) assert.equal((await req('POST', '/api/auth/register', body)).status, 400);
  assert.equal((await req('POST', '/api/auth/register', { username: ' charlie ', password: 'old1234' })).status, 200);
  assert.equal((await req('POST', '/api/auth/register', { username: 'charlie', password: 'old1234' })).status, 400);
  for (const body of [{}, { username: 'missing', password: 'x' }, { username: 'charlie', password: 'wrong' }]) assert.equal((await req('POST', '/api/auth/login', body)).status, 401);
  const login = await req('POST', '/api/auth/login', { username: 'charlie', password: 'old1234' });
  assert.equal(login.status, 200); assert.equal(login.data.role, 'user');
  const token = login.data.token;
  assert.equal((await req('GET', '/api/auth/me', undefined, token)).data.username, 'charlie');
  for (const [body, status] of [[{}, 400], [{ oldPassword: 'wrong', newUsername: 'charlie', newPassword: 'new1234' }, 401], [{ oldPassword: 'old1234', newUsername: 'alice', newPassword: 'new1234' }, 400]]) assert.equal((await req('PUT', '/api/auth/update', body, token)).status, status);
  const updated = await req('PUT', '/api/auth/update', { oldPassword: 'old1234', newUsername: 'newcharlie', newPassword: 'new1234' }, token);
  assert.equal(updated.status, 200); assert.ok(updated.data.token);
  assert.equal((await req('POST', '/api/auth/login', { username: 'charlie', password: 'old1234' })).status, 401);
  assert.equal((await req('POST', '/api/auth/login', { username: 'newcharlie', password: 'new1234' })).status, 200);
});

test('JSON parsing and body size limits', async () => {
  const malformed = await fetch(base + '/api/markers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400); await malformed.text();
  assert.equal((await req('POST', '/api/markers', { title: 'x'.repeat(110000) }, tokens.alice)).status, 413);
});

test('auth limiter is per IP and does not throttle health', async () => {
  const headers = { 'X-Forwarded-For': '192.0.2.1' };
  for (let i = 0; i < 10; i++) assert.equal((await req('POST', '/api/auth/login', {}, undefined, headers)).status, 401);
  const limited = await req('POST', '/api/auth/login', {}, undefined, headers);
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await req('GET', '/api/health', undefined, undefined, headers)).status, 200);
  assert.equal((await req('POST', '/api/auth/login', {})).status, 401);
});

test('static page and vendor cache policies', async () => {
  const page = await req('GET', '/'); assert.equal(page.status, 200); assert.match(page.data, /leaflet/);
  assert.equal(page.headers.get('x-powered-by'), null);
  const vendor = await req('GET', '/vendor/leaflet.js'); assert.equal(vendor.status, 200);
  assert.match(vendor.headers.get('cache-control'), /max-age=31536000/);
});
