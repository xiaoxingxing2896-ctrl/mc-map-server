// Cloudflare Turnstile 人机验证（零 npm 依赖）
// 通过 secret TURNSTILE_SECRET_KEY 配置；未配置则跳过校验（不阻塞）。
export async function verifyTurnstile(secretKey, token, ip) {
  if (!secretKey) return true; // 未配置 secret：不强制人机验证
  if (!token) return false;
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token, remoteip: ip || '' }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success === true;
  } catch (e) {
    return false;
  }
}