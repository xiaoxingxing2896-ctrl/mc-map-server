// 密码哈希：
//  - 新密码：PBKDF2-SHA256（Web Crypto，Workers 原生，不占用同步 CPU 限制）
//  - 旧密码：内联 bcryptjs 兼容验证（现有用户数据库中的 $2a$ 哈希可直接登录）
import bcrypt from './vendor/bcrypt-wrapper.js';
import { b64url, fromB64url, encodeUtf8, safeEqual } from './util.js';

const PBKDF2_ITER = 100000; // 可与 cost 10 的 bcrypt 相当的安全强度

export async function hashPassword(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encodeUtf8(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith('$2')) {
    // 旧版 bcrypt 哈希。注意：cost 10 的验证在 Workers 免费层（10ms CPU/请求）可能超限，
    // 建议部署后让用户重新设置密码（转为 PBKDF2），或使用 Workers Paid 计划（30s CPU）。
    try {
      return bcrypt.compareSync(plain, stored);
    } catch (e) {
      return false;
    }
  }
  const parts = stored.split('$');
  if (parts[0] !== 'pbkdf2' || parts.length !== 4) return false;
  const [_, iterStr, saltB64, hashB64] = parts;
  const iter = parseInt(iterStr, 10);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  try {
    const salt = fromB64url(saltB64);
    const key = await crypto.subtle.importKey('raw', encodeUtf8(plain), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
    return safeEqual(b64url(bits), hashB64);
  } catch (e) {
    return false;
  }
}