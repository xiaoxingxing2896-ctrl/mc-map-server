/**
 * 极简请求日志中间件（零依赖），输出：时间 / 方法 / 路径 / 状态码 / 耗时。
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const ip = req.ip || '-';
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms ip=${ip}`);
  });
  next();
}

module.exports = { requestLogger };