// 应用装配：安全头 / 限流 / 日志 / 路由分发 / 数据库初始化。
// 与 Express 版行为对齐；依赖通过 deps 注入（D1/R2 或本地 shim）。
import * as R from './routes.js';
import { hashPassword } from './password.js';
import { b64url } from './util.js';

const STARTED_AT = Date.now();
const VERSION = '1.0.0';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://unpkg.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function applySecurityHeaders(h) {
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('X-XSS-Protection', '0');
  h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  h.set('Content-Security-Policy', CSP);
}

function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => hits.clear(), windowMs);
  if (timer && timer.unref) timer.unref();
  return {
    allow(key) {
      const now = Date.now();
      const rec = hits.get(key);
      if (!rec || now - rec.start > windowMs) {
        hits.set(key, { start: now, count: 1 });
        return true;
      }
      rec.count += 1;
      return rec.count <= max;
    },
  };
}

// 让 handler 能读 req.params（Request 不可扩展，用 Proxy 提供只读视图）
function withParams(req, params) {
  return new Proxy(req, {
    get(t, k) {
      if (k === 'params') return params;
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

async function initDatabase(db, adminPassword) {
  // 用户表（新库直接含邮箱列）
  await db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      email TEXT,
      email_verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS markers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      x INTEGER NOT NULL,
      z INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'other',
      icon TEXT DEFAULT 'marker',
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_public INTEGER DEFAULT 1,
      world TEXT DEFAULT 'overworld'
  )`);
  // 邮箱验证码表
  await db.run(`CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // 兼容已存在的旧 users 表：补充邮箱列（列已存在则忽略）
  try { await db.run("ALTER TABLE users ADD COLUMN email TEXT"); } catch {}
  try { await db.run("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0"); } catch {}
  // 兼容旧 markers 表：补充 world 列（多维度预留）
  try { await db.run("ALTER TABLE markers ADD COLUMN world TEXT DEFAULT 'overworld'"); } catch {}
  // 无默认管理员：用户只能通过邮箱注册，第一个注册者自动成为 owner（见 register 逻辑）
}

function randomPassword() {
  return b64url(crypto.getRandomValues(new Uint8Array(9))).slice(0, 12);
}

export function createApp(deps) {
  const ctx = {
    db: deps.db,
    bucket: deps.bucket,
    jwtSecret: deps.jwtSecret,
    jwtExpiresIn: deps.jwtExpiresIn || 604800,
    mail: deps.mail || { apiKey: '', from: '' },
    turnstile: deps.turnstile || '',
  };
  const globalLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300 });
  const authLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 });

  let initPromise = null;
  function ensureInit() {
    if (!initPromise) initPromise = initDatabase(ctx.db, deps.adminPassword || null);
    return initPromise;
  }

  return async function handleRequest(request) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const ip = request.headers.get('cf-connecting-ip') || 'local';

    try {
      await ensureInit();
    } catch (e) {
      console.error('数据库初始化失败:', e);
      return R.json({ error: '数据库初始化失败' }, 500);
    }

    if (!globalLimiter.allow(ip)) return R.json({ error: '请求过于频繁，请稍后再试' }, 429);
    if (path.startsWith('/api/auth') && !authLimiter.allow(ip)) {
      return R.json({ error: '请求过于频繁，请稍后再试' }, 429);
    }

    const start = Date.now();
    let response;
    try {
      response = await dispatch(request, method, path, ctx);
    } catch (e) {
      if (e && typeof e === 'object' && e.status && e.msg) {
        response = R.json({ error: e.msg }, e.status);
      } else {
        console.error(e);
        response = R.json({ error: '服务器内部错误' }, 500);
      }
    }
    console.log(`${new Date().toISOString()} ${method} ${path} ${response.status} ${Date.now() - start}ms ip=${ip}`);
    applySecurityHeaders(response.headers);
    return response;
  };
}

async function dispatch(request, method, path, ctx) {
  if (path === '/api/health' && method === 'GET') {
    return R.json({ ok: true, uptime: (Date.now() - STARTED_AT) / 1000, time: new Date().toISOString(), version: VERSION });
  }
  if (path === '/api/auth/register' && method === 'POST') return R.register(request, ctx);
  if (path === '/api/auth/login' && method === 'POST') return R.login(request, ctx);
  if (path === '/api/auth/email/code' && method === 'POST') return R.emailCode(request, ctx);
  if (path === '/api/auth/verify-email' && method === 'POST') return R.verifyEmail(request, ctx);
  if (path === '/api/auth/forgot' && method === 'POST') return R.forgot(request, ctx);
  if (path === '/api/auth/reset' && method === 'POST') return R.resetPassword(request, ctx);
  if (path === '/api/auth/update' && method === 'PUT') return R.updateAccount(request, ctx);
  if (path === '/api/me' && method === 'GET') return R.me(request, ctx);
  if (path === '/api/users' && method === 'GET') return R.listUsers(request, ctx);
  let m = path.match(/^\/api\/users\/(\d+)\/role$/);
  if (m && method === 'PUT') return R.setUserRole(withParams(request, { id: m[1] }), ctx);
  if (path === '/api/tiles' && method === 'GET') return R.listTiles(request, ctx);
  if (path === '/api/markers' && method === 'GET') return R.listMarkers(request, ctx);
  if (path === '/api/markers' && method === 'POST') return R.createMarker(request, ctx);
  m = path.match(/^\/api\/markers\/(\d+)$/);
  if (m) {
    const req = withParams(request, { id: m[1] });
    if (method === 'GET') return R.getMarker(req, ctx);
    if (method === 'PUT') return R.updateMarker(req, ctx);
    if (method === 'DELETE') return R.deleteMarker(req, ctx);
  }
  m = path.match(/^\/tiles\/(.+)$/);
  if (m && method === 'GET') return R.serveTile(withParams(request, { key: m[1] }), ctx);
  return R.json({ error: 'Not Found' }, 404);
}