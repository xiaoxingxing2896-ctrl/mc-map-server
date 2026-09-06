import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { signJwt, verifyJwt } from '../worker/jwt.js';
import { hashPassword, verifyPassword } from '../worker/password.js';
import { b64url, fromB64url, encodeUtf8, decodeUtf8, safeEqual } from '../worker/util.js';
import { isValidEmail, genCode, issueCode, verifyCode, sendEmail, codeEmailHtml } from '../worker/email.js';
import { verifyTurnstile } from '../worker/turnstile.js';
import { createDbFromD1, createBucketFromR2 } from '../worker/store.js';
import { workerFixture, secret } from './helpers.mjs';

test('JWT interoperates with jsonwebtoken in both directions', async () => {
  const payload = { id: 3, username: '玩家', role: 'user' };
  const signed = await signJwt(payload, secret, 60);
  assert.equal(jwt.verify(signed, secret).username, payload.username);
  assert.equal((await verifyJwt(jwt.sign(payload, secret, { expiresIn: '1h' }), secret)).id, 3);
  assert.equal(await verifyJwt(signed, 'wrong-secret'), null);
  const parts = signed.split('.'); parts[1] = b64url(encodeUtf8(JSON.stringify({ ...payload, role: 'owner' })));
  assert.equal(await verifyJwt(parts.join('.'), secret), null);
});

test('JWT rejects malformed, missing-expiry and expired tokens', async () => {
  for (const token of [null, 1, '', 'a.b', '%.%.%', jwt.sign({ id: 1 }, secret), jwt.sign({ id: 1 }, secret, { expiresIn: -1 })]) assert.equal(await verifyJwt(token, secret), null);
});

test('password hashes use fresh salts and support legacy bcrypt', async () => {
  const a = await hashPassword('GoodPass123'), b = await hashPassword('GoodPass123');
  assert.notEqual(a, b); assert.equal(await verifyPassword('GoodPass123', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  const legacy = bcrypt.hashSync('legacy-password', 4);
  assert.equal(await verifyPassword('legacy-password', legacy), true);
  assert.equal(await verifyPassword('wrong', legacy), false);
  for (const stored of [null, 3, '', '$2bad', 'unknown$hash', 'pbkdf2$999$a$b', 'pbkdf2$bad$a$b', 'pbkdf2$1000$%$hash']) assert.equal(await verifyPassword('anything', stored), false);
});

test('base64url handles binary and Unicode and safeEqual handles supported types', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(fromB64url(b64url(bytes)), bytes);
  assert.equal(decodeUtf8(fromB64url(b64url(encodeUtf8('地图🌍')))), '地图🌍');
  assert.doesNotMatch(b64url(bytes.buffer), /[+/=]/);
  assert.equal(safeEqual('地图', '地图'), true); assert.equal(safeEqual('ab', 'ac'), false);
  assert.equal(safeEqual('a', 'ab'), false); assert.equal(safeEqual(bytes.buffer, bytes), true);
  assert.equal(safeEqual(bytes, bytes.buffer), true);
});

test('email validation and code templates', () => {
  for (const email of [null, 1, '', 'a', 'a@@b.com', 'a b@c.com']) assert.equal(isValidEmail(email), false);
  assert.equal(isValidEmail(' User@example.com '), true);
  assert.match(genCode(), /^\d{6}$/);
  for (const action of ['register', 'reset', 'login']) assert.match(codeEmailHtml('123456', action), /123456/);
});

test('verification codes are normalized, scoped, expiring and single-use', async t => {
  const { db } = await workerFixture(t);
  const code = await issueCode(db, ' Alice@Example.com ', 'reset');
  assert.equal(await verifyCode(db, 'alice@example.com', 'register', code), false);
  assert.equal(await verifyCode(db, 'bob@example.com', 'reset', code), false);
  assert.equal(await verifyCode(db, 'alice@example.com', 'reset', 'wrong'), false);
  assert.equal(await verifyCode(db, ' ALICE@example.com ', 'reset', Number(code)), true);
  assert.equal(await verifyCode(db, 'alice@example.com', 'reset', code), false);
  const expired = await issueCode(db, 'alice@example.com', 'reset');
  await db.run('UPDATE verification_codes SET expires_at = ?', [Date.now() - 1]);
  assert.equal(await verifyCode(db, 'alice@example.com', 'reset', expired), false);
});

test('email provider errors propagate and no real email is sent', async t => {
  const mail = { apiKey: 'test-key', from: 'sender@example.com' }, body = { to: 'receiver@example.com', subject: 'test', html: '<p>test</p>' };
  await assert.rejects(sendEmail(null, body), /邮件服务未配置/);
  const mocked = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails'); assert.equal(init.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(init.body), { from: mail.from, ...body }); return new Response('provider error', { status: 503 });
  });
  await assert.rejects(sendEmail(mail, body), /邮件发送失败/);
  mocked.mock.mockImplementation(async () => { throw new Error('offline'); });
  await assert.rejects(sendEmail(mail, body), /offline/);
});

test('Turnstile bypass, success, rejection, invalid JSON and network failure', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.deepEqual(JSON.parse(init.body), { secret: 'secret', response: 'token', remoteip: '192.0.2.1' });
    return Response.json({ success: true });
  });
  assert.equal(await verifyTurnstile('', '', ''), true);
  assert.equal(await verifyTurnstile('secret', '', ''), false);
  assert.equal(mocked.mock.callCount(), 0);
  assert.equal(await verifyTurnstile('secret', 'token', '192.0.2.1'), true);
  for (const response of [Response.json({ success: false }), Response.json({ success: 'true' }), new Response('bad', { status: 500 }), new Response('{')]) {
    mocked.mock.mockImplementation(async () => response);
    assert.equal(await verifyTurnstile('secret', 'token'), false);
  }
  mocked.mock.mockImplementation(async () => { throw new Error('offline'); });
  assert.equal(await verifyTurnstile('secret', 'token'), false);
});

test('D1 adapter uses first/all/run, binds only nonempty parameters and maps metadata', async () => {
  const calls = [];
  let first = { id: 1 }, all = { results: [{ id: 1 }] }, run = { meta: { changes: 2, last_row_id: 7 } };
  const statement = {
    bind(...params) { calls.push(params); return this; },
    async first() { return first; }, async all() { return all; }, async run() { return run; },
  };
  const db = createDbFromD1({ prepare(sql) { assert.equal(typeof sql, 'string'); return statement; } });
  assert.deepEqual(await db.get('SELECT 1'), { id: 1 }); assert.equal(calls.length, 0);
  assert.deepEqual(await db.query('SELECT ?', [1]), [{ id: 1 }]); assert.deepEqual(calls, [[1]]);
  assert.deepEqual(await db.run('INSERT', [0, '']), { changes: 2, lastRowId: 7 });
  first = null; all = {}; run = {};
  assert.equal(await db.get('SELECT'), null); assert.deepEqual(await db.query('SELECT'), []);
  assert.deepEqual(await db.run('UPDATE'), { changes: 0, lastRowId: null });
  statement.first = async () => { throw new Error('D1 unavailable'); };
  await assert.rejects(db.get('SELECT'), /D1 unavailable/);
});

test('R2 adapter follows pagination retaining world prefix and maps object metadata', async () => {
  const calls = [];
  const bucket = createBucketFromR2({
    async list(options) {
      calls.push(options);
      return options.cursor ? { objects: [{ key: 'nether/b.png' }], truncated: false } : { objects: [{ key: 'nether/a.png' }], truncated: true, cursor: 'next-page' };
    },
    async get(key) { return key === 'missing' ? null : { async arrayBuffer() { return new Uint8Array([1, 2]).buffer; }, httpMetadata: key === 'webp' ? { contentType: 'image/webp' } : undefined }; },
  });
  assert.deepEqual((await bucket.listTiles('nether/')).map(o => o.key), ['nether/a.png', 'nether/b.png']);
  assert.deepEqual(calls, [{ prefix: 'nether/' }, { prefix: 'nether/', cursor: 'next-page' }]);
  calls.length = 0; await bucket.listTiles(); assert.deepEqual(calls[0], {});
  assert.equal(await bucket.getTile('missing'), null);
  assert.equal((await bucket.getTile('webp')).type, 'image/webp');
  assert.deepEqual(new Uint8Array((await bucket.getTile('png')).buf), new Uint8Array([1, 2]));
  assert.equal((await bucket.getTile('png')).type, 'image/png');
});

test('Worker entry point wires D1, R2 and configured JWT secret', async t => {
  const { db } = await workerFixture(t);
  const { default: worker } = await import('../worker/index.js');
  const env = {
    JWT_SECRET: secret, JWT_EXPIRES_IN: '3600',
    DB: { prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        first: () => db.get(sql, params),
        async all() { return { results: await db.query(sql, params) }; },
        async run() { const r = await db.run(sql, params); return { meta: { changes: r.changes, last_row_id: r.lastRowId } }; },
      };
    } },
    BUCKET: { async list() { return { objects: [{ key: 'x1z2.png' }], truncated: false }; }, async get() { return null; } },
  };
  const response = await worker.fetch(new Request('https://test.invalid/api/tiles'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ x: 1, z: 2, url: '/tiles/x1z2.png' }]);
  const token = jwt.sign({ id: 1, username: 'entry-test', role: 'user' }, secret, { expiresIn: '1h' });
  const me = await worker.fetch(new Request('https://test.invalid/api/me', { headers: { Authorization: `Bearer ${token}` } }), env);
  assert.equal(me.status, 200); assert.equal((await me.json()).username, 'entry-test');
});
