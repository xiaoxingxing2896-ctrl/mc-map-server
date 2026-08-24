// 业务路由：与 Express 版（src/routes/*）逐端点对齐，错误消息完全一致。
// 所有 handler 签名：async (req, ctx) => Response
import { verifyJwt, signJwt } from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';
import { isValidEmail, sendEmail, issueCode, verifyCode, codeEmailHtml } from './email.js';
import { verifyTurnstile } from './turnstile.js';

function isInt(v) {
  return v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v));
}

function safeIcon(icon, fallback) {
  if (typeof icon === 'string' && Array.from(icon).length <= 3 && icon.trim() !== '') {
    return icon.trim();
  }
  return fallback || '';
}

function isValidUsername(u) {
  return typeof u === 'string' && u.trim().length >= 3 && u.trim().length <= 32;
}

// 人机验证（未配置 secret 时放行；失败返回 400 响应，通过返回 null）
async function checkTurnstile(req, ctx, body) {
  const ok = await verifyTurnstile(ctx.turnstile, body && body.turnstile, req.headers.get('cf-connecting-ip') || '');
  if (!ok) return json({ error: '请完成人机验证' }, 400);
  return null;
}

// 密码强度：8 位以上，且同时含大小写字母与数字
function isStrongPassword(p) {
  return typeof p === 'string' && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(p);
}

// 认证：返回 { user } 或抛 { status, msg }
export async function authenticateReq(req, ctx) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw { status: 401, msg: '未提供 Token' };
  const user = await verifyJwt(token, ctx.jwtSecret);
  if (!user) throw { status: 403, msg: 'Token 无效' };
  return { user };
}

export async function optionalAuthReq(req, ctx) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verifyJwt(token, ctx.jwtSecret);
}

// ---------- 认证 ----------
export async function register(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const username = body && body.username;
  const password = body && body.password;
  const email = body && body.email;
  if (!isValidUsername(username)) {
    return json({ error: '用户名无效（3-32位）' }, 400);
  }
  if (!isStrongPassword(password)) {
    return json({ error: '密码需8位以上，且同时含大写字母、小写字母和数字' }, 400);
  }
  // 邮箱必填（必须邮箱注册后登录）
  if (!isValidEmail(email)) return json({ error: '必须使用有效的邮箱注册' }, 400);
  const emailNorm = email.trim().toLowerCase();
  const hash = await hashPassword(password);
  try {
    const dupe = await ctx.db.get("SELECT id, email_verified FROM users WHERE email = ?", [emailNorm]);
    if (dupe) {
      if (dupe.email_verified !== 1) {
        // 已注册但尚未验证：引导用户去完成验证，而不是卡在"已注册"（不再要求人机验证）
        return json({ error: '该邮箱尚未验证，请前往完成邮箱验证', needVerify: true }, 400);
      }
      return json({ error: '该邮箱已被注册' }, 400);
    }
    // 仅"真正新注册"才要求人机验证（重复注册/引导验证分支已在上方返回）
    const tk = await checkTurnstile(req, ctx, body);
    if (tk) return tk;
    // 无任何用户时，第一个注册者成为管理员(owner)
    const cnt = await ctx.db.get("SELECT COUNT(*) AS c FROM users");
    const role = (cnt && cnt.c === 0) ? 'owner' : 'user';
    const res = await ctx.db.run("INSERT INTO users (username, password_hash, email, email_verified, role) VALUES (?, ?, ?, ?, ?)",
      [username.trim(), hash, emailNorm, 0, role]);
    return json({ message: '注册成功，请验证邮箱后登录', userId: res.lastRowId, role });
  } catch (e) {
    return json({ error: '注册失败' }, 500);
  }
}

// 登录：仅邮箱+密码，且要求邮箱已验证（不启用人机验证）
export async function login(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const email = body && body.email;
  const password = body && body.password;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return json({ error: '邮箱或密码错误' }, 401);
  }
  const emailNorm = email.trim().toLowerCase();
  const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [emailNorm]);
  if (!user) return json({ error: '邮箱或密码错误' }, 401);
  if (user.email_verified !== 1) return json({ error: '邮箱未验证，请先验证邮箱' }, 403);
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: '邮箱或密码错误' }, 401);
  const token = await signJwt({ id: user.id, username: user.username, role: user.role }, ctx.jwtSecret, ctx.jwtExpiresIn);
  return json({ token, username: user.username, role: user.role });
}

export async function updateAccount(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const body = await req.json().catch(() => ({}));
  const oldPassword = body && body.oldPassword;
  const newUsername = body && body.newUsername;
  const newPassword = body && body.newPassword;
  if (typeof oldPassword !== 'string' || !isValidUsername(newUsername) || !isStrongPassword(newPassword)) {
    return json({ error: '旧密码、新用户名或新密码无效（新密码需8位以上且含大小写字母和数字）' }, 400);
  }
  const row = await ctx.db.get("SELECT * FROM users WHERE id = ?", [user.id]);
  if (!row) return json({ error: '用户不存在' }, 401);
  const ok = await verifyPassword(oldPassword, row.password_hash);
  if (!ok) return json({ error: '旧密码错误' }, 401);
  const exists = await ctx.db.get("SELECT id FROM users WHERE username = ? AND id != ?", [newUsername.trim(), user.id]);
  if (exists) return json({ error: '用户名已存在' }, 400);
  const newHash = await hashPassword(newPassword);
  try {
    await ctx.db.run("UPDATE users SET username = ?, password_hash = ? WHERE id = ?", [newUsername.trim(), newHash, user.id]);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
  const token = await signJwt({ id: user.id, username: newUsername.trim(), role: user.role }, ctx.jwtSecret, ctx.jwtExpiresIn);
  return json({ message: '信息已更新', token, username: newUsername.trim() });
}

// ---------- 邮箱验证码认证（Resend） ----------
// 验证码获取冷却：同一邮箱同一用途，5 分钟内禁止再次获取
const CODE_COOLDOWN_MS = 5 * 60 * 1000;

export async function emailCode(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const t = await checkTurnstile(req, ctx, body);
  if (t) return t;
  const email = body && body.email;
  const purpose = (body && body.purpose) || 'register';
  if (!isValidEmail(email)) return json({ error: '邮箱格式不正确' }, 400);
  if (!['register', 'reset'].includes(purpose)) return json({ error: '无效的操作类型' }, 400);
  const emailNorm = email.trim().toLowerCase();
  const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [emailNorm]);
  if (purpose === 'reset' && !user) return json({ error: '该邮箱未注册' }, 404);
  if (purpose === 'register') {
    // 注册验证：允许"已注册但未验证"的邮箱补发验证码
    if (!user) return json({ error: '该邮箱未注册，请先注册' }, 404);
    if (user.email_verified === 1) return json({ error: '该邮箱已通过验证' }, 400);
  }
  // 后端冷却：5 分钟内禁止再次获取
  try {
    const last = await ctx.db.get("SELECT created_at FROM verification_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1", [emailNorm, purpose]);
    if (last && last.created_at) {
      const dt = Date.parse(String(last.created_at).replace(' ', 'T') + 'Z');
      if (!isNaN(dt) && Date.now() - dt < CODE_COOLDOWN_MS) {
        const wait = Math.ceil((CODE_COOLDOWN_MS - (Date.now() - dt)) / 1000);
        return json({ error: '验证码获取过于频繁，请 5 分钟后再试', retryAfter: wait }, 429);
      }
    }
  } catch (e) { /* 冷却查询异常不阻断发码 */ }
  try {
    const code = await issueCode(ctx.db, emailNorm, purpose);
    await sendEmail(ctx.mail, { to: emailNorm, subject: '【MC Map】验证码', html: codeEmailHtml(code, purpose) });
    return json({ message: '验证码已发送到邮箱，10 分钟内有效', retryAfter: Math.ceil(CODE_COOLDOWN_MS / 1000) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function verifyEmail(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const t = await checkTurnstile(req, ctx, body);
  if (t) return t;
  const email = body && body.email;
  const code = body && body.code;
  if (!isValidEmail(email) || !code) return json({ error: '邮箱或验证码无效' }, 400);
  const emailNorm = email.trim().toLowerCase();
  const ok = await verifyCode(ctx.db, emailNorm, 'register', code);
  if (!ok) return json({ error: '验证码错误或已过期' }, 400);
  const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [emailNorm]);
  if (!user) return json({ error: '该邮箱未注册' }, 404);
  await ctx.db.run("UPDATE users SET email_verified = 1 WHERE id = ?", [user.id]);
  return json({ message: '邮箱验证成功' });
}

export async function forgot(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const t = await checkTurnstile(req, ctx, body);
  if (t) return t;
  const email = body && body.email;
  if (!isValidEmail(email)) return json({ error: '邮箱格式不正确' }, 400);
  const emailNorm = email.trim().toLowerCase();
  const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [emailNorm]);
  if (!user) return json({ error: '该邮箱未注册' }, 404);
  try {
    const code = await issueCode(ctx.db, emailNorm, 'reset');
    await sendEmail(ctx.mail, { to: emailNorm, subject: '【MC Map】重置密码', html: codeEmailHtml(code, 'reset') });
    return json({ message: '重置验证码已发送到邮箱' });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function resetPassword(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const t = await checkTurnstile(req, ctx, body);
  if (t) return t;
  const email = body && body.email;
  const code = body && body.code;
  const newPassword = body && body.newPassword;
  if (!isValidEmail(email) || !code || !isStrongPassword(newPassword)) {
    return json({ error: '邮箱、验证码或新密码无效（新密码需8位以上且含大小写字母和数字）' }, 400);
  }
  const emailNorm = email.trim().toLowerCase();
  const ok = await verifyCode(ctx.db, emailNorm, 'reset', code);
  if (!ok) return json({ error: '验证码错误或已过期' }, 400);
  const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [emailNorm]);
  if (!user) return json({ error: '该邮箱未注册' }, 404);
  const newHash = await hashPassword(newPassword);
  await ctx.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, user.id]);
  return json({ message: '密码已重置，请用新密码登录' });
}

export async function me(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  return json({ id: user.id, username: user.username, role: user.role });
}

// ---------- 用户管理 ----------
export async function listUsers(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  if (user.role !== 'owner' && user.role !== 'admin') return json({ error: '权限不足' }, 403);
  const rows = await ctx.db.query("SELECT id, username, role, created_at FROM users", []);
  return json(rows);
}

export async function setUserRole(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  if (user.role !== 'owner' && user.role !== 'admin') return json({ error: '权限不足' }, 403);
  const targetId = parseInt(req.params.id, 10);
  const body = await req.json().catch(() => ({}));
  const newRole = body && body.role;
  if (!['user', 'admin'].includes(newRole) && newRole !== 'owner') {
    return json({ error: '无效的角色' }, 400);
  }
  const target = await ctx.db.get("SELECT * FROM users WHERE id = ?", [targetId]);
  if (!target) return json({ error: '用户不存在' }, 404);
  if (targetId === user.id) return json({ error: '无法修改自己的权限' }, 403);
  if (user.role === 'admin' && (target.role === 'owner' || target.role === 'admin')) {
    return json({ error: '无权修改该用户的权限' }, 403);
  }
  await ctx.db.run("UPDATE users SET role = ? WHERE id = ?", [newRole, targetId]);
  return json({ message: '权限已更新' });
}

// ---------- 瓦片索引 ----------
export async function listTiles(req, ctx) {
  let files;
  try {
    files = await ctx.bucket.listTiles();
  } catch (e) {
    return json({ error: '无法读取瓦片目录' }, 500);
  }
  const tiles = [];
  for (const obj of files) {
    const f = obj.key;
    if (!f.endsWith('.png') && !f.endsWith('.jpg') && !f.endsWith('.webp')) continue;
    const match = f.match(/[xX](-?\d+)[zZ](-?\d+)/);
    if (match) {
      tiles.push({ x: parseInt(match[1]), z: parseInt(match[2]), url: `/tiles/${f}` });
    } else {
      const match2 = f.match(/\d+_\d+_x(-?\d+)_z(-?\d+)\./);
      if (match2) {
        tiles.push({ x: parseInt(match2[1]), z: parseInt(match2[2]), url: `/tiles/${f}` });
      }
    }
  }
  return json(tiles);
}

// ---------- 标注 ----------
export async function listMarkers(req, ctx) {
  const currentUser = await optionalAuthReq(req, ctx);
  if (currentUser) {
    const rows = await ctx.db.query("SELECT * FROM markers WHERE is_public = 1 OR created_by = ? ORDER BY created_at DESC", [currentUser.username]);
    return json(rows);
  }
  const rows = await ctx.db.query("SELECT * FROM markers WHERE is_public = 1 ORDER BY created_at DESC", []);
  return json(rows);
}

export async function getMarker(req, ctx) {
  const row = await ctx.db.get("SELECT * FROM markers WHERE id = ?", [req.params.id]);
  if (!row) return json({ error: '标注不存在' }, 404);
  return json(row);
}

export async function createMarker(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const body = await req.json().catch(() => ({}));
  const { x, z, title, description, category, isPublic, icon } = body || {};
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return json({ error: '标题不能为空' }, 400);
  }
  if (!isInt(x) || !isInt(z)) {
    return json({ error: 'x/z 必须是整数' }, 400);
  }
  const res = await ctx.db.run(
    `INSERT INTO markers (x, z, title, description, category, created_by, is_public, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [Number(x), Number(z), title.trim(), description || '', category || 'other', user.username, isPublic ? 1 : 0, safeIcon(icon)]
  );
  const row = await ctx.db.get("SELECT * FROM markers WHERE id = ?", [res.lastRowId]);
  return json(row);
}

export async function updateMarker(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const body = await req.json().catch(() => ({}));
  const { title, description, category, isPublic, x, z, icon } = body || {};
  const marker = await ctx.db.get("SELECT * FROM markers WHERE id = ?", [req.params.id]);
  if (!marker) return json({ error: '标注不存在' }, 404);
  if (marker.created_by !== user.username && user.role !== 'admin' && user.role !== 'owner') {
    return json({ error: '无权修改' }, 403);
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return json({ error: '标题不能为空' }, 400);
  }
  if ((x !== undefined && !isInt(x)) || (z !== undefined && !isInt(z))) {
    return json({ error: 'x/z 必须是整数' }, 400);
  }
  await ctx.db.run(
    `UPDATE markers SET title=?, description=?, category=?, is_public=?, x=?, z=?, icon=? WHERE id=?`,
    [
      title !== undefined ? title.trim() : marker.title,
      description !== undefined ? description : marker.description,
      category || 'other',
      isPublic ? 1 : 0,
      x !== undefined ? Number(x) : marker.x,
      z !== undefined ? Number(z) : marker.z,
      safeIcon(icon, marker.icon),
      req.params.id,
    ]
  );
  const row = await ctx.db.get("SELECT * FROM markers WHERE id = ?", [req.params.id]);
  return json(row);
}

export async function deleteMarker(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const marker = await ctx.db.get("SELECT * FROM markers WHERE id = ?", [req.params.id]);
  if (!marker) return json({ error: '标注不存在' }, 404);
  if (marker.created_by !== user.username && user.role !== 'admin' && user.role !== 'owner') {
    return json({ error: '无权删除' }, 403);
  }
  await ctx.db.run("DELETE FROM markers WHERE id = ?", [req.params.id]);
  return json({ message: '已删除' });
}

// ---------- 瓦片静态文件（R2） ----------
export async function serveTile(req, ctx) {
  const key = req.params.key;
  const tile = await ctx.bucket.getTile(key);
  if (!tile) return json({ error: 'Not Found' }, 404);
  return new Response(tile.buf, {
    headers: { 'Content-Type': tile.type, 'Cache-Control': 'public, max-age=604800' },
  });
}

// 响应助手
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Server-Time': String(Date.now()) },
  });
}