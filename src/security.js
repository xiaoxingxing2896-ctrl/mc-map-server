/**
 * 安全加固中间件（零第三方依赖）：
 * 1. securityHeaders —— 补齐安全响应头（CSP / X-Frame-Options 等）
 * 2. memoryRateLimit —— 内存滑动窗口限流
 */

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0'); // 现代浏览器已内置 XSS 防护，此头仅兼容旧版
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com", // 'unsafe-inline' 因页面为内联脚本；unpkg 为 Leaflet CDN 回退
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
}

function memoryRateLimit({ windowMs, max, message }) {
  const hits = new Map(); // key -> { start, count }
  const timer = setInterval(() => hits.clear(), windowMs);
  if (timer.unref) timer.unref(); // 不阻塞进程退出

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now - rec.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    rec.count += 1;
    if (rec.count > max) {
      const retryAfter = Math.ceil((rec.start + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message || '请求过于频繁，请稍后再试' });
    }
    next();
  };
}

module.exports = { securityHeaders, memoryRateLimit };