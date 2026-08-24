// 本地全量回归测试（Node）：用 sqlite3 + tiles 目录 shim 直接调用 worker app，
// 验证 32 项断言与 Express 版行为一致（API 路径/响应/错误消息/权限/限流/安全头）。
import { createApp } from './app.js';
import { createDbFromSqlite, createBucketFromDir } from './dev-shims.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sqlite3 = require('../node_modules/sqlite3').verbose();

// 复制真实数据库到临时文件（含 admin/admin123 与既有标注），测试后删除
const ROOT = path.resolve(__dirname, '..');
const tmpDb = path.join(__dirname, '_worker-test.db');
fs.copyFileSync(path.join(ROOT, 'mcmap.db'), tmpDb);

const db = new sqlite3.Database(tmpDb);
const app = createApp({
  db: createDbFromSqlite(db),
  bucket: createBucketFromDir(path.join(ROOT, 'tiles')),
  jwtSecret: 'test-secret',
  jwtExpiresIn: 604800,
});

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra || ''}`); }
}

async function req(method, pathName, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await app(new Request('https://test.local' + pathName, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }));
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}

const uname = 'smoketest_' + Date.now().toString().slice(-6);
const newName = uname.replace('smoketest', 'smoketest2');

(async () => {
  // 1 健康检查
  let r = await req('GET', '/api/health');
  check('health ok', r.status === 200 && r.data.ok === true);

  // 2 页面由 Workers Assets 承载：Worker 对非 /api /tiles 路径返回 404（路由隔离）
  r = await req('GET', '/');
  check('非 API 路径隔离 404', r.status === 404 && r.data.error === 'Not Found');
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  check('index.html 含 vendor 引用', html.includes('/vendor/leaflet.css') && html.includes('/vendor/leaflet.js'));
  check('index.html 含 CDN 回退', html.includes('unpkg.com/leaflet@1.9.4'));

  // 3 瓦片索引（目录 shim = 本地 tiles/）
  r = await req('GET', '/api/tiles');
  check('tiles 49张', r.status === 200 && r.data.length === 49, `n=${r.data && r.data.length}`);
  check('tile 坐标解析', r.data.some(t => t.x === -2048 && t.z === 0));

  // 4 瓦片静态服务（R2 目录 shim）
  r = await req('GET', '/tiles/3_16_x-2048_z0.png');
  check('tile 图片可访问', r.status === 200 && (r.headers.get('content-type') || '').includes('image/png'));
  check('tile 缓存头', (r.headers.get('cache-control') || '').includes('max-age=604800'));
  r = await req('GET', '/tiles/not-exist.png');
  check('tile 不存在 404', r.status === 404);

  // 5 匿名标注
  r = await req('GET', '/api/markers');
  check('匿名仅公开标注', r.status === 200 && r.data.every(m => m.is_public === 1) && r.data.length === 2, `n=${r.data && r.data.length}`);

  // 6 登录 admin（验证旧 bcrypt 哈希兼容）
  r = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  check('admin 登录(旧bcrypt)', r.status === 200 && !!r.data.token && r.data.role === 'owner', `status=${r.status} ${JSON.stringify(r.data)}`);
  const adminToken = r.data && r.data.token;

  // 7 me
  r = await req('GET', '/api/me', null, adminToken);
  check('me 返回 owner', r.status === 200 && r.data.username === 'admin' && r.data.role === 'owner');

  // 8 用户列表
  r = await req('GET', '/api/users', null, adminToken);
  check('users 列表', r.status === 200 && r.data.length >= 2);

  // 9 修改自己角色 -> 403
  const me = await req('GET', '/api/me', null, adminToken);
  r = await req('PUT', `/api/users/${me.data.id}/role`, { role: 'user' }, adminToken);
  check('改自己角色 403', r.status === 403);

  // 10 新增标注（PBKDF2 新用户密码链路在注册步骤验证）
  r = await req('POST', '/api/markers', { x: 123, z: 456, title: '回归测试标注', description: 'test', category: 'landmark', isPublic: true, icon: '⭐' }, adminToken);
  check('新增标注', r.status === 200 && r.data.id && r.data.x === 123 && r.data.z === 456 && r.data.icon === '⭐', JSON.stringify(r.data));
  const newId = r.data && r.data.id;

  // 11 修改标注
  r = await req('PUT', `/api/markers/${newId}`, { title: '回归测试标注2', x: 999, z: -100, isPublic: false }, adminToken);
  check('修改标注', r.status === 200 && r.data.title === '回归测试标注2' && r.data.x === 999 && r.data.is_public === 0);

  // 12 登录可见私有
  r = await req('GET', '/api/markers', null, adminToken);
  check('登录可见私有', r.status === 200 && r.data.some(m => m.id === newId && m.is_public === 0));

  // 13 匿名不可见私有
  r = await req('GET', '/api/markers');
  check('匿名不可见私有', r.status === 200 && !r.data.some(m => m.id === newId));

  // 14 x/z 非整数 -> 400
  r = await req('POST', '/api/markers', { x: 'abc', z: 1, title: 'bad' }, adminToken);
  check('x/z 校验 400', r.status === 400);

  // 15 空标题 -> 400
  r = await req('POST', '/api/markers', { x: 1, z: 1, title: '' }, adminToken);
  check('空标题 400', r.status === 400);

  // 16 未登录新增 -> 401
  r = await req('POST', '/api/markers', { x: 1, z: 1, title: 'x' });
  check('未登录新增 401', r.status === 401);

  // 17 删除标注
  r = await req('DELETE', `/api/markers/${newId}`, null, adminToken);
  check('删除标注', r.status === 200);
  r = await req('GET', '/api/markers');
  check('删除后回到2条', r.data.length === 2);

  // 18 注册（PBKDF2）+ 登录
  r = await req('POST', '/api/auth/register', { username: uname, password: 'test1234' });
  check('注册成功', r.status === 200, JSON.stringify(r.data));
  r = await req('POST', '/api/auth/login', { username: uname, password: 'test1234' });
  check('新用户登录(PBKDF2)', r.status === 200 && !!r.data.token && r.data.role === 'user');
  const userToken = r.data && r.data.token;

  // 19 普通用户访问用户列表 -> 403
  const users = await req('GET', '/api/users', null, userToken);
  check('user 无权看用户列表 403', users.status === 403);

  // 20 修改账号信息
  r = await req('PUT', '/api/auth/update', { oldPassword: 'test1234', newUsername: newName, newPassword: 'newpass123' }, userToken);
  check('修改账号', r.status === 200 && r.data.username === newName, JSON.stringify(r.data));
  r = await req('POST', '/api/auth/login', { username: newName, password: 'newpass123' });
  check('新账号信息登录', r.status === 200);

  // 21 安全响应头
  const hdr = await req('GET', '/api/health');
  check('CSP 头', (hdr.headers.get('content-security-policy') || '').includes("default-src 'self'"));
  check('X-Frame-Options', hdr.headers.get('x-frame-options') === 'DENY');

  // 22 认证限流：连打 12 次错误登录，应出现 429
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const res = await req('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
    if (res.status === 429) { got429 = true; break; }
  }
  check('认证接口限流 429', got429);

  // 23 全局限流独立（GET 不受认证限流影响）
  r = await req('GET', '/api/tiles');
  check('全局限流未误伤 GET', r.status === 200);

  console.log(`\n==== 结果: ${pass} PASS / ${fail} FAIL ====`);
  db.close();
  fs.unlinkSync(tmpDb);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本异常:', e); process.exit(1); });