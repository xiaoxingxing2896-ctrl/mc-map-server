// 通用工具：base64url、恒定时间比较（Node ESM 与 Cloudflare Workers 通用）
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function b64url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeUtf8(s) { return encoder.encode(s); }
export function decodeUtf8(b) { return decoder.decode(b); }

export function safeEqual(a, b) {
  if (a instanceof ArrayBuffer) a = new Uint8Array(a);
  if (b instanceof ArrayBuffer) b = new Uint8Array(b);
  if (typeof a === 'string') a = encodeUtf8(a);
  if (typeof b === 'string') b = encodeUtf8(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}