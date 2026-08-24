const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra || ''}`); }
}
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

(async () => {
  const uname = 'smoketest_' + Date.now().toString().slice(-6);
  const newName = uname.replace('smoketest', 'smoketest2');
  // 1 健康检查
  let r = await req('GET', '/api/health');
  check('health ok', r.status === 200 && r.data.ok === true);

  // 2 页面
  const page = await fetch(BASE + '/');
  const html = await page.text();
  check('index.html 200', page.status === 200);
  check('vendor leaflet link', html.includes('/vendor/leaflet.css') && html.includes('/vendor/leaflet.js'));
  check('CDN fallback present', html.includes('unpkg.com/leaflet@1.9.4'));
  const v404 = await fetch(BASE + '/vendor/leaflet.js');
  check('vendor 404 (本地无文件,走CDN回退)', v404.status === 404);

  // 3 瓦片
  r = await req('GET', '/api/tiles');
  check('tiles 49张', r.status === 200 && r.data.length === 49, `n=${r.data && r.data.length}`);
  check('tile 坐标解析', r.data.some(t => t.x === -2048 && t.z === 0), JSON.stringify(r.data.slice(0,1)));

  // 4 瓦片静态服务
  const tile = await fetch(BASE + '/tiles/3_16_x-2048_z0.png');
  check('tile 图片可访问', tile.status === 200 && tile.headers.get('content-type').includes('image/png'));
  check('tile 缓存头', (tile.headers.get('cache-control') || '').includes('max-age=604800'));

  // 5 匿名标注
  r = await req('GET', '/api/markers');
  check('匿名仅公开标注', r.status === 200 && r.data.every(m => m.is_public === 1) && r.data.length === 2, `n=${r.data && r.data.length}`);

  // 6 登录 admin
  r = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  check('admin 登录', r.status === 200 && !!r.data.token && r.data.role === 'owner', `status=${r.status}`);
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

  // 10 新增标注
  r = await req('POST', '/api/markers', { x: 123, z: 456, title: '回归测试标注', description: 'test', category: 'landmark', isPublic: true, icon: '⭐' }, adminToken);
  check('新增标注', r.status === 200 && r.data.id && r.data.x === 123 && r.data.z === 456 && r.data.icon === '⭐', JSON.stringify(r.data));
  const newId = r.data && r.data.id;

  // 11 修改标注
  r = await req('PUT', `/api/markers/${newId}`, { title: '回归测试标注2', x: 999, z: -100, isPublic: false }, adminToken);
  check('修改标注', r.status === 200 && r.data.title === '回归测试标注2' && r.data.x === 999 && r.data.is_public === 0);

  // 12 登录后可见私有标注
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

  // 18 注册 + 登录
  r = await req('POST', '/api/auth/register', { username: uname, password: 'test1234' });
  check('注册成功', r.status === 200, JSON.stringify(r.data));
  r = await req('POST', '/api/auth/login', { username: uname, password: 'test1234' });
  check('新用户登录', r.status === 200 && !!r.data.token && r.data.role === 'user');
  const userToken = r.data && r.data.token;

  // 19 普通用户改 admin 角色 -> 403
  const users = await req('GET', '/api/users', null, userToken);
  check('user 无权看用户列表 403', users.status === 403);

  // 20 修改账号信息
  r = await req('PUT', '/api/auth/update', { oldPassword: 'test1234', newUsername: newName, newPassword: 'newpass123' }, userToken);
  check('修改账号', r.status === 200 && r.data.username === newName, JSON.stringify(r.data));
  r = await req('POST', '/api/auth/login', { username: newName, password: 'newpass123' });
  check('新账号信息登录', r.status === 200);

  // 21 安全响应头
  const hdr = await fetch(BASE + '/api/health');
  check('CSP 头', (hdr.headers.get('content-security-policy') || '').includes("default-src 'self'"));
  check('X-Frame-Options', hdr.headers.get('x-frame-options') === 'DENY');
  check('无 x-powered-by', !hdr.headers.get('x-powered-by'));

  // 22 认证限流：连打 12 次错误登录，应出现 429
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const res = await req('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
    if (res.status === 429) { got429 = true; break; }
  }
  check('认证接口限流 429', got429);

  console.log(`\n==== 结果: ${pass} PASS / ${fail} FAIL ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本异常:', e); process.exit(1); });