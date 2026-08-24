// Cloudflare Workers 入口（零 npm 依赖）
import { createApp } from './app.js';
import { createDbFromD1, createBucketFromR2 } from './store.js';

let cached = null;

export default {
  async fetch(request, env) {
    if (!cached) {
      if (!env.JWT_SECRET) {
        console.warn('⚠️  未配置 JWT_SECRET（wrangler secret put JWT_SECRET），当前使用不安全的开发密钥！');
      }
      cached = createApp({
        db: createDbFromD1(env.DB),
        bucket: createBucketFromR2(env.BUCKET),
        jwtSecret: env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
        jwtExpiresIn: env.JWT_EXPIRES_IN ? parseInt(env.JWT_EXPIRES_IN, 10) : 604800,
        adminPassword: env.ADMIN_PASSWORD || null,
        mail: { apiKey: env.RESEND_API_KEY || '', from: env.MAIL_FROM || 'noreply@worldeternal.xyz' },
      });
    }
    return cached(request);
  },
};