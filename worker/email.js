// 邮箱验证码 + Resend 发信（零 npm 依赖）
// 邮件服务通过 Cloudflare secret 注入：RESEND_API_KEY / MAIL_FROM

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 位数字
}

// 用 Resend API 发送邮件
export async function sendEmail(mail, { to, subject, html }) {
  if (!mail || !mail.apiKey || !mail.from) {
    throw new Error('邮件服务未配置（请设置 RESEND_API_KEY 与 MAIL_FROM）');
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mail.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: mail.from, to, subject, html }),
  });
  if (!resp.ok) {
    let text = '';
    try { text = await resp.text(); } catch {}
    throw new Error('邮件发送失败: ' + (text || resp.status));
  }
  return true;
}

const CODE_TTL_MS = 10 * 60 * 1000; // 验证码 10 分钟有效

// 生成并保存验证码
export async function issueCode(db, email, purpose) {
  const code = genCode();
  const expiresAt = Date.now() + CODE_TTL_MS;
  await db.run(
    "INSERT INTO verification_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)",
    [email.trim().toLowerCase(), code, purpose, expiresAt]
  );
  return code;
}

// 校验验证码（一次性：校验成功即删除），成功返回 true
export async function verifyCode(db, email, purpose, code) {
  const emailNorm = email.trim().toLowerCase();
  const row = await db.get(
    "SELECT * FROM verification_codes WHERE email = ? AND purpose = ? AND code = ? ORDER BY id DESC LIMIT 1",
    [emailNorm, purpose, String(code)]
  );
  if (!row) return false;
  if (!row.expires_at || row.expires_at < Date.now()) return false;
  await db.run("DELETE FROM verification_codes WHERE id = ?", [row.id]);
  return true;
}

export function codeEmailHtml(code, action) {
  const label = action === 'login' ? '登录' : action === 'reset' ? '重置密码' : '注册验证';
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
      <h2 style="color:#b8860b;margin-bottom:16px">🗺️ MC Map 邮箱验证</h2>
      <p>你的${label}验证码是：</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#b8860b;margin:16px 0;padding:12px;background:#faf6ec;border-radius:8px;text-align:center">${code}</div>
      <p style="color:#777;font-size:13px">验证码 10 分钟内有效，请勿泄露。</p>
    </div>`;
}