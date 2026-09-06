import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';
import { createApp } from '../worker/app.js';
import { createDbFromSqlite } from '../worker/dev-shims.js';

export const secret = 'isolated-test-secret';
export const users = [
  { id: 1, username: 'owner', role: 'owner' },
  { id: 2, username: 'admin', role: 'admin' },
  { id: 3, username: 'alice', role: 'user' },
  { id: 4, username: 'bob', role: 'user' },
];
export const tokens = Object.fromEntries(users.map(u => [u.username, jwt.sign(u, secret, { expiresIn: '1h' })]));
export const tileFiles = ['x-10z20.png', '3_16_x-2048_z0.jpg', 'x0z0.webp', 'README.txt', 'invalid.png'];

export async function workerFixture(t, overrides = {}) {
  const raw = new sqlite3.Database(':memory:');
  t.after(() => new Promise((resolve, reject) => raw.close(e => e ? reject(e) : resolve())));
  const db = createDbFromSqlite(raw);
  const bucket = {
    async listTiles(prefix = '') { return [...tileFiles, 'nether/x1_z2.png', 'end/x3_z4.png'].filter(k => k.startsWith(prefix)).map(key => ({ key })); },
    async getTile(key) { return tileFiles.includes(key) ? { buf: new Uint8Array([137, 80, 78, 71]), type: 'image/png' } : null; },
  };
  const app = createApp({ db, bucket, jwtSecret: secret, ...overrides });
  let seq = 0;
  async function req(method, path, body, token, extra = {}) {
    const response = await app(new Request('https://test.invalid' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': `test-${++seq}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, headers: response.headers, data };
  }
  await req('GET', '/api/health');
  return { req, db, app, bucket };
}

export async function seed(db) {
  for (const u of users) await db.run('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)', [u.id, u.username, 'unused', u.role]);
}
