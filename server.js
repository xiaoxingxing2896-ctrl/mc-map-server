/**
 * mc-map-server 入口。
 * 功能与地图结构与原版完全一致，重构点：
 *  - 配置外置（config.js + 环境变量 / .env）
 *  - 安全头 / 限流 / 输入校验（零第三方依赖手写实现）
 *  - 请求日志 / 健康检查 / 静态资源缓存头
 *  - 分层路由（src/routes）
 */
const express = require('express');
const path = require('path');
const config = require('./config');
const { db, initDatabase } = require('./src/db');
const { securityHeaders, memoryRateLimit } = require('./src/security');
const { requestLogger } = require('./src/logger');

const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(securityHeaders);

// 健康检查（监控用，置于限流之前）
app.get('/api/health', (req, res) => {
  db.get('SELECT 1 AS ok', (err) => {
    res.json({
      ok: !err,
      uptime: process.uptime(),
      time: new Date().toISOString(),
      version: require('./package.json').version,
    });
  });
});

app.use(requestLogger);
app.use(express.json({ limit: '100kb' }));
app.use(memoryRateLimit(config.rateLimit.global));

// 静态资源：瓦片长缓存（7 天），前端 vendor 长缓存（1 年），页面本身短缓存（5 分钟）
const tilesDir = config.tilesDir;
if (!require('fs').existsSync(tilesDir)) require('fs').mkdirSync(tilesDir, { recursive: true });
app.use('/tiles', express.static(tilesDir, {
  maxAge: '7d',
  setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=604800'); },
}));
app.use(express.static(config.publicDir, {
  maxAge: '5m',
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}vendor${path.sep}`) || filePath.endsWith('.png')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// 认证接口单独限流（防爆破）
app.use('/api/auth', memoryRateLimit(config.rateLimit.auth));

// 业务路由
// /api/me 保持原版顶层路径（前端登录状态检测依赖它）
app.get('/api/me', require('./src/middleware').authenticate, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/tiles', require('./src/routes/tiles'));
app.use('/api/markers', require('./src/routes/markers'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : '服务器内部错误' });
});

async function main() {
  try {
    await initDatabase();
  } catch (e) {
    console.error('数据库初始化失败:', e);
    process.exit(1);
  }
  app.listen(config.port, () => {
    console.log(`🗺️  MC Map Server 运行在 http://localhost:${config.port}`);
    console.log(`📂  请将地图瓦片放入 ${config.tilesDir}`);
    if (!process.env.JWT_SECRET) {
      console.log('⚠️  未设置 JWT_SECRET，当前使用随机密钥，服务重启后所有登录将失效。生产环境请在 .env 中配置。');
    }
  });
}

main();