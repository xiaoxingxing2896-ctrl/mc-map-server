import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerFixture, seed, tokens } from './helpers.mjs';
import { issueCode } from '../worker/email.js';
const password = 'GoodPass123';
const account = { username: 'charlie', email: ' CHARLIE@example.com ', password };

test('email registration, verification, login, password reset and account update', async t => {
  const { req, db } = await workerFixture(t);
  const registration = await req('POST', '/api/auth/register', account);
  assert.equal(registration.status, 200); assert.equal(registration.data.role, 'owner');
  const row = await db.get('SELECT * FROM users');
  assert.equal(row.email, 'charlie@example.com'); assert.equal(row.email_verified, 0);
  assert.match(row.password_hash, /^pbkdf2\$/); assert.notEqual(row.password_hash, password);
  assert.equal((await req('POST', '/api/auth/login', account)).status, 403);
  const duplicate = await req('POST', '/api/auth/register', account);
  assert.equal(duplicate.status, 400); assert.equal(duplicate.data.needVerify, true);
  const code = await issueCode(db, account.email, 'register');
  assert.equal((await req('POST', '/api/auth/verify-email', { email: account.email, code: 'invalid' })).status, 400);
  assert.equal((await req('POST', '/api/auth/verify-email', { email: account.email, code })).status, 200);
  assert.equal((await req('POST', '/api/auth/verify-email', { email: account.email, code })).status, 400);
  assert.equal((await req('POST', '/api/auth/register', account)).status, 400);
  assert.equal((await req('POST', '/api/auth/register', { ...account, username: 'second', email: 'second@example.com' })).data.role, 'user');
  assert.equal((await req('POST', '/api/auth/login', { ...account, password: 'wrong' })).status, 401);
  const login = await req('POST', '/api/auth/login', account);
  assert.equal(login.status, 200); assert.equal(login.data.role, 'owner');
  assert.equal((await req('GET', '/api/me', undefined, login.data.token)).data.username, 'charlie');
  const reset = await issueCode(db, account.email, 'reset');
  assert.equal((await req('POST', '/api/auth/reset', { email: account.email, code: reset, newPassword: 'weak' })).status, 400);
  assert.equal((await req('POST', '/api/auth/reset', { email: account.email, code: reset, newPassword: 'Changed123' })).status, 200);
  assert.equal((await req('POST', '/api/auth/reset', { email: account.email, code: reset, newPassword: 'Another123' })).status, 400);
  assert.equal((await req('POST', '/api/auth/login', account)).status, 401);
  const next = await req('POST', '/api/auth/login', { ...account, password: 'Changed123' });
  assert.equal(next.status, 200);
  for (const [body, status] of [[{}, 400], [{ oldPassword: 'wrong', newUsername: 'charlie', newPassword: password }, 401], [{ oldPassword: 'Changed123', newUsername: 'second', newPassword: password }, 400]]) assert.equal((await req('PUT', '/api/auth/update', body, next.data.token)).status, status);
  const update = await req('PUT', '/api/auth/update', { oldPassword: 'Changed123', newUsername: ' renamed ', newPassword: password }, next.data.token);
  assert.equal(update.status, 200); assert.equal(update.data.username, 'renamed');
  assert.equal((await req('GET', '/api/me', undefined, update.data.token)).data.username, 'renamed');
  assert.equal((await req('POST', '/api/auth/login', account)).status, 200);
});

test('registration validates username, password strength and email', async t => {
  const { req, db } = await workerFixture(t);
  for (const override of [{ username: 'ab' }, { username: 'a'.repeat(33) }, { username: 3 }, { password: 'Good12' }, { password: 'lowercase123' }, { password: 'UPPERCASE123' }, { password: 'NoNumbersHere' }, { email: 'bad' }, { email: null }]) assert.equal((await req('POST', '/api/auth/register', { ...account, ...override })).status, 400);
  assert.equal((await db.get('SELECT COUNT(*) AS c FROM users')).c, 0);
  for (const body of [{}, { email: 'missing@example.com', password }, { username: 'charlie', password }]) assert.equal((await req('POST', '/api/auth/login', body)).status, 401);
});

test('email delivery is mocked, code cooldown prevents resend and verified addresses are rejected', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return Response.json({ id: 'test' }); });
  const { req, db } = await workerFixture(t, { mail: { apiKey: 'test-key', from: 'test@example.com' } });
  await req('POST', '/api/auth/register', account);
  const sent = await req('POST', '/api/auth/email/code', { email: account.email });
  assert.equal(sent.status, 200); assert.equal(sent.data.retryAfter, 300);
  assert.equal(calls.length, 1); assert.equal(calls[0].body.to, 'charlie@example.com');
  const saved = await db.get('SELECT * FROM verification_codes');
  assert.match(calls[0].body.html, new RegExp(saved.code));
  const limited = await req('POST', '/api/auth/email/code', { email: account.email });
  assert.equal(limited.status, 429); assert.ok(limited.data.retryAfter > 0); assert.equal(calls.length, 1);
  await db.run("UPDATE verification_codes SET created_at = datetime('now', '-6 minutes')");
  assert.equal((await req('POST', '/api/auth/email/code', { email: account.email })).status, 200);
  await db.run('UPDATE users SET email_verified = 1');
  assert.equal((await req('POST', '/api/auth/email/code', { email: account.email })).status, 400);
  assert.equal((await req('POST', '/api/auth/forgot', { email: account.email })).status, 200);
  assert.equal(calls.length, 3);
});

test('email endpoints reject malformed input, unknown users and unavailable delivery', async t => {
  const { req } = await workerFixture(t);
  for (const route of ['email/code', 'verify-email', 'forgot', 'reset']) assert.equal((await req('POST', '/api/auth/' + route, {})).status, 400);
  assert.equal((await req('POST', '/api/auth/email/code', { email: account.email, purpose: 'invalid' })).status, 400);
  for (const purpose of ['register', 'reset']) assert.equal((await req('POST', '/api/auth/email/code', { email: account.email, purpose })).status, 404);
  assert.equal((await req('POST', '/api/auth/forgot', { email: account.email })).status, 404);
  await req('POST', '/api/auth/register', account);
  assert.equal((await req('POST', '/api/auth/email/code', { email: account.email })).status, 500);
  assert.equal((await req('POST', '/api/auth/forgot', { email: account.email })).status, 500);
});

test('Turnstile gates new registrations and recovery without writing users', async t => {
  const { req, db } = await workerFixture(t, { turnstile: 'configured' });
  assert.equal((await req('POST', '/api/auth/register', account)).status, 400);
  assert.equal((await db.get('SELECT COUNT(*) AS c FROM users')).c, 0);
  for (const route of ['email/code', 'verify-email', 'forgot', 'reset']) assert.equal((await req('POST', '/api/auth/' + route, { email: account.email })).status, 400);
});

test('world filters isolate both tile and marker indexes', async t => {
  const { req, db } = await workerFixture(t); await seed(db);
  for (const world of ['overworld', 'nether', 'end']) {
    assert.equal((await req('POST', '/api/markers', { title: world, x: 0, z: 0, world, isPublic: true }, tokens.alice)).status, 200);
  }
  assert.equal((await req('POST', '/api/markers', { title: 'bad', x: 0, z: 0, world: 'moon' }, tokens.alice)).status, 400);
  for (const world of ['overworld', 'nether', 'end']) {
    assert.deepEqual((await req('GET', `/api/markers?world=${world.toUpperCase()}`)).data.map(m => m.title), [world]);
    const tiles = (await req('GET', `/api/tiles?world=${world}`)).data;
    assert.equal(tiles.length, world === 'overworld' ? 3 : 1);
    if (world !== 'overworld') assert.ok(tiles[0].url.startsWith(`/tiles/${world}/`));
  }
});

test('worker rate limits isolate clients and reset after the window', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1700000000000 });
  const { req } = await workerFixture(t);
  const ip = { 'cf-connecting-ip': '192.0.2.1' };
  for (let i = 0; i < 10; i++) assert.equal((await req('POST', '/api/auth/login', {}, undefined, ip)).status, 401);
  assert.equal((await req('POST', '/api/auth/login', {}, undefined, ip)).status, 429);
  assert.equal((await req('POST', '/api/auth/login', {})).status, 401);
  assert.equal((await req('GET', '/api/tiles', undefined, undefined, ip)).status, 200);
  t.mock.timers.tick(60001);
  assert.equal((await req('POST', '/api/auth/login', {}, undefined, ip)).status, 401);
  for (let i = 0; i < 299; i++) assert.equal((await req('GET', '/api/health', undefined, undefined, ip)).status, 200);
  assert.equal((await req('GET', '/api/health', undefined, undefined, ip)).status, 429);
});

test('storage errors become safe JSON responses', async t => {
  const { req, bucket, db } = await workerFixture(t);
  t.mock.method(bucket, 'listTiles', async () => { throw new Error('private storage detail'); });
  assert.equal((await req('GET', '/api/tiles')).data.error, '无法读取瓦片目录');
  t.mock.method(db, 'query', async () => { throw new Error('private SQL detail'); });
  const r = await req('GET', '/api/markers');
  assert.equal(r.status, 500); assert.equal(r.data.error, '服务器内部错误');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});
