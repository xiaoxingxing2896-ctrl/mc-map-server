// 业务路由：与 Express 版（src/routes/*）逐端点对齐，错误消息完全一致。
// 所有 handler 签名：async (req, ctx) => Response
import { verifyJwt, signJwt } from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';
import { isValidEmail, sendEmail, issueCode, verifyCode, codeEmailHtml } from './email.js';

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
  if (!isValidUsername(username) || typeof password !== 'string' || password.length < 4) {
    return json({ error: '用户名或密码无效（用户名3-32位，密码至少4位）' }, 400);
  }
  // 邮箱可选：注册时带邮箱则会登记邮箱（未验证），后续可发送验证
  const useEmail = email !== undefined && email !== null && String(email).trim() !== '';
  if (useEmail && !isValidEmail(email)) return json({ error: '邮箱格式不正确' }, 400);
  const hash = await hashPassword(password);
  try {
    let res;
    if (useEmail) {
      const emailNorm = String(email).trim().toLowerCase();
      const dupe = await ctx.db.get("SELECT id FROM users WHERE email = ?", [emailNorm]);
      if (dupe) return json({ error: '该邮箱已被注册' }, 400);
      res = await ctx.db.run("INSERT INTO users (username, password_hash, email, email_verified) VALUES (?, ?, ?, ?)",
        [username.trim(), hash, emailNorm, 0]);
    } else {
      res = await ctx.db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username.trim(), hash]);
    }
    return json({ message: '注册成功', userId: res.lastRowId });
  } catch (e) {
    return json({ error: '用户名已存在' }, 400);
  }
}

export async function login(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const username = body && body.username;
  const password = body && body.password;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return json({ error: '用户名或密码错误' }, 401);
  }
  const user = await ctx.db.get("SELECT * FROM users WHERE username = ?", [username.trim()]);
  if (!user) return json({ error: '用户名或密码错误' }, 401);
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: '用户名或密码错误' }, 401);
  const token = await signJwt({ id: user.id, username: user.username, role: user.role }, ctx.jwtSecret, ctx.jwtExpiresIn);
  return json({ token, username: user.username, role: user.role });
}

export async function updateAccount(req, ctx) {
  const { user } = await authenticateReq(req, ctx);
  const body = await req.json().catch(() => ({}));
  const oldPassword = body && body.oldPassword;
  const newUsername = body && body.newUsername;
  const newPassword = body && body.newPassword;
  if (typeof oldPassword !== 'string' || !isValidUsername(newUsername) || typeof newPassword !== 'string' || newPassword.length < 4) {
    return json({ error: '旧密码、新用户名或新密码无效' }, 400);
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
export async function emailCode(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const email = body && body.email;
  const purpose = (body && body.purpose) || 'login';
  if (!isValidEmail(email)) return json({ error: '邮箱格式不正确' }, 400);
  if (!['login', 'register', 'reset'].includes(purpose)) return json({ error: '无效的操作类型' }, 400);
  const emailNorm = email.trim().toLowerCase();
  const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [emailNorm]);
  if ((purpose === 'login' || purpose === 'reset') && !user) {
    return json({ error: '该邮箱未注册' }, 404);
  }
  if (purpose === 'register') {
    // 注册验证：允许"已注册但未验证"的邮箱补发验证码
    if (!user) return json({ error: '该邮箱未注册，请先注册' }, 404);
    if (user.email_verified === 1) return json({ error: '该邮箱已通过验证' }, 400);
  }
  try {
    const code = await issueCode(ctx.db, emailNorm, purpose);
    await sendEmail(ctx.mail, { to: emailNorm, subject: '【MC Map】验证码', html: codeEmailHtml(code, purpose) });
    return json({ message: '验证码已发送到邮箱，10 分钟内有效' });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function emailLogin(req, ctx) {
  const body = await req.json().catch(() => ({}));
  const email = body && body.email;
  const code = body && body.code;
  if (!isValidEmail(email) || !code) return json({ error: '邮箱或验证码无效' }, 400);
  const emailNorm = email.trim().toLowerCase();
  const ok = await verifyCode(ctx.db, emailNorm, 'login', code);
  if (!ok) return json({ error: '验证码错误或已过期' }, 400);
  const user = await ctx.db.get("SELECT * FROM users WHERE email = ?", [emailNorm]);
  if (!user) return json({ error: '该邮箱未注册' }, 404);
  await ctx.db.run("UPDATE users SET email_verified = 1 WHERE id = ?", [user.id]);
  const token = await signJwt({ id: user.id, username: user.username, role: user.role }, ctx.jwtSecret, ctx.jwtExpiresIn);
  return json({ token, username: user.username, role: user.role });
}

export async function verifyEmail(req, ctx) {
  const body = await req.json().catch(() => ({}));
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
  const email = body && body.email;
  const code = body && body.code;
  const newPassword = body && body.newPassword;
  if (!isValidEmail(email) || !code || typeof newPassword !== 'string' || newPassword.length < 4) {
    return json({ error: '邮箱、验证码或新密码无效（新密码至少4位）' }, 400);
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
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}