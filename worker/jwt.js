// HS256 JWT 签发/验证（Web Crypto，零依赖，替代 jsonwebtoken）
import { b64url, fromB64url, encodeUtf8, decodeUtf8 } from './util.js';

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encodeUtf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// 与原版 jsonwebtoken 兼容：expiresIn 以秒为单位
export async function signJwt(payload, secret, expiresInSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const h = b64url(encodeUtf8(JSON.stringify(header)));
  const p = b64url(encodeUtf8(JSON.stringify(body)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encodeUtf8(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}

// 验证通过返回 payload（含 exp/iat），失败返回 null
export async function verifyJwt(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, fromB64url(parts[2]), encodeUtf8(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const body = JSON.parse(decodeUtf8(fromB64url(parts[1])));
    if (!body.exp || body.exp * 1000 < Date.now()) return null;
    return body;
  } catch (e) {
    return null;
  }
}