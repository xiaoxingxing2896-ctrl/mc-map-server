/**
 * 配置中心（零第三方依赖）。
 * 优先级：环境变量 > .env 文件 > 内置默认值。
 * .env 中的键不会覆盖已存在的环境变量（Docker/PM2 注入优先）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_FILE = path.join(__dirname, '.env');

function loadEnvFile() {
  let content;
  try {
    content = fs.readFileSync(ENV_FILE, 'utf8');
  } catch {
    return; // .env 不存在时静默忽略
  }
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const ROOT = __dirname;

function getEnv(name, fallback) {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : fallback;
}

const config = {
  env: getEnv('NODE_ENV', 'development'),
  port: parseInt(getEnv('PORT', '3000'), 10),

  // JWT 密钥：生产环境务必通过环境变量 / .env 设置（openssl rand -base64 48）。
  // 未设置时自动生成随机密钥，但服务重启后所有已签发令牌会失效，请注意。
  jwtSecret: getEnv('JWT_SECRET', crypto.randomBytes(48).toString('hex')),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '7d'),

  // 数据与静态资源路径：Docker 部署时通过挂载卷覆盖这两项即可实现持久化。
  dbPath: path.resolve(getEnv('DB_PATH', path.join(ROOT, 'mcmap.db'))),
  tilesDir: path.resolve(getEnv('TILES_DIR', path.join(ROOT, 'tiles'))),
  publicDir: path.join(ROOT, 'public'),

  // 全新部署时初始 Owner 的密码；缺省则自动生成随机密码并打印在日志中。
  adminPassword: getEnv('ADMIN_PASSWORD', null),

  // 前面有 nginx/Caddy 等反代时设为 1，使限流能按真实客户端 IP 计算。
  trustProxy: getEnv('TRUST_PROXY', '0') === '1',

  rateLimit: {
    global: { windowMs: 60 * 1000, max: 300 }, // 全局限流：300 次/分钟/IP
    auth: { windowMs: 60 * 1000, max: 10 },    // 认证接口限流：10 次/分钟/IP
  },
};

module.exports = config;