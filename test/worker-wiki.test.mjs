import { test } from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { createApp } from '../worker/app.js';
import { createDbFromSqlite } from '../worker/dev-shims.js';
import { secret, tokens, seed } from './helpers.mjs';

const MD = 'web/src/pages/wiki/';
const NAV = 'web/src/data/wiki.json';
const REPO = 'owner/repo';
const BRANCH = 'main';
const CONFLICT_MSG = '文件已被修改，请刷新后重试';
const NAV_FIXTURE = {
  sections: [
    {
      key: 'start',
      label: '新手线',
      tag: 'START',
      pages: [{ slug: 'start/index', label: '新手线总览', short: '总览' }],
    },
  ],
};

// 内存版 GitHub API：只实现 Contents / git trees 中用到的部分。
function createGithubMock(initial = {}) {
  const files = new Map();
  const calls = [];
  let seq = 0;
  const state = { failStatus: 0, branch: BRANCH };

  for (const [filePath, content] of Object.entries(initial)) {
    files.set(filePath, { raw: Buffer.from(content, 'utf8'), sha: 'blob-' + ++seq });
  }

  function respond(status, data) {
    return new Response(data === undefined ? '' : JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function fetchImpl(url, init = {}) {
    const u = new URL(String(url));
    const method = String(init.method || 'GET').toUpperCase();
    const headers = init.headers || {};
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: u, headers, body });

    if (state.failStatus) return respond(state.failStatus, { message: 'forced failure' });
    const auth = headers.Authorization || headers.authorization || '';
    if (!/^Bearer .+/.test(auth)) return respond(401, { message: 'Bad credentials' });

    const match = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(contents|git\/trees)(?:\/(.*))?$/);
    if (!match) return respond(404, { message: 'Not Found' });
    const repo = match[1];
    const kind = match[2];
    const rest = match[3] || '';

    if (kind === 'git/trees') {
      if (rest !== state.branch) return respond(404, { message: 'branch not found' });
      return respond(200, {
        sha: 'tree-sha',
        truncated: false,
        tree: [...files.entries()].map(([filePath, rec]) => ({ path: filePath, type: 'blob', sha: rec.sha })),
      });
    }

    const filePath = decodeURIComponent(rest);
    const rec = files.get(filePath);
    const htmlUrl = 'https://github.com/' + repo + '/blob/' + state.branch + '/' + filePath;

    if (method === 'GET') {
      if (!rec) return respond(404, { message: 'Not Found' });
      return respond(200, {
        type: 'file',
        encoding: 'base64',
        path: filePath,
        sha: rec.sha,
        size: rec.raw.length,
        content: rec.raw.toString('base64'),
        html_url: htmlUrl,
      });
    }

    if (method === 'PUT') {
      if (body.branch !== state.branch) return respond(404, { message: 'branch not found' });
      if (rec && body.sha !== rec.sha) return respond(409, { message: 'sha mismatch' });
      if (!rec && body.sha) return respond(422, { message: 'sha supplied for missing file' });
      const raw = Buffer.from(body.content, 'base64');
      const next = { raw, sha: 'blob-' + ++seq };
      files.set(filePath, next);
      return respond(200, {
        content: { path: filePath, sha: next.sha, html_url: htmlUrl },
        commit: { sha: 'commit-' + seq },
      });
    }

    if (method === 'DELETE') {
      if (!rec) return respond(404, { message: 'Not Found' });
      if (body.sha !== rec.sha) return respond(409, { message: 'sha mismatch' });
      files.delete(filePath);
      return respond(200, { commit: { sha: 'commit-' + ++seq } });
    }

    return respond(405, { message: 'Method Not Allowed' });
  }

  return { files, calls, state, fetch: fetchImpl };
}

let ipSeq = 0;

async function call(app, method, path, { token, body, raw, contentType, headers = {} } = {}) {
  const h = { 'cf-connecting-ip': 'wiki-test-' + ++ipSeq, ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  let payload;
  if (raw !== undefined) {
    h['Content-Type'] = contentType || 'application/octet-stream';
    payload = raw;
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await app(new Request('https://test.invalid' + path, { method, headers: h, body: payload }));
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, headers: res.headers, data };
}

async function fixture(t, github = { token: 'ghp_test', repo: REPO, branch: BRANCH }) {
  const raw = new sqlite3.Database(':memory:');
  t.after(() => new Promise((resolve, reject) => raw.close(e => (e ? reject(e) : resolve()))));
  const db = createDbFromSqlite(raw);
  const app = createApp({
    db,
    bucket: {
      async listTiles() { return []; },
      async getTile() { return null; },
    },
    jwtSecret: secret,
    github,
  });
  await call(app, 'GET', '/api/health');
  await seed(db);
  return { app, db, call: (m, p, o) => call(app, m, p, o) };
}

function lastPut(gh) {
  return [...gh.calls].reverse().find(c => c.method === 'PUT');
}

test('wiki endpoints require login and read the current admin/owner role from the database', async t => {
  const gh = createGithubMock({ [MD + 'index.md']: '# 首页' });
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call, db } = await fixture(t);

  const anonymous = await call('GET', '/api/wiki/list');
  assert.equal(anonymous.status, 401);
  assert.deepEqual(anonymous.data, { error: '请先登录' });

  const invalid = await call('GET', '/api/wiki/list', { token: 'not-a-jwt' });
  assert.equal(invalid.status, 403);
  assert.deepEqual(invalid.data, { error: '权限不足' });

  const normalUser = await call('GET', '/api/wiki/list', { token: tokens.alice });
  assert.equal(normalUser.status, 403);
  assert.deepEqual(normalUser.data, { error: '权限不足' });

  const admin = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get('cache-control'), 'no-store');
  assert.equal(admin.headers.get('content-type'), 'application/json; charset=utf-8');

  const owner = await call('GET', '/api/wiki/list', { token: tokens.owner });
  assert.equal(owner.status, 200);

  // 旧 token 中的角色不作数，必须读数据库当前值
  await db.run("UPDATE users SET role = 'admin' WHERE username = 'alice'");
  assert.equal((await call('GET', '/api/wiki/list', { token: tokens.alice })).status, 200);
});

test('GET /api/wiki/list returns nav, filtered markdown files, navSha, repo and branch', async t => {
  const gh = createGithubMock({
    [MD + 'index.md']: '---\ntitle: 首页\n---\n',
    [MD + 'start/01-join.md']: '# 加入服务器\n',
    [MD + 'start/_draft.md']: '# 草稿\n',
    [MD + 'facilities/_template.md']: '# 模板\n',
    [MD + 'start/notes.txt']: 'not markdown\n',
    [NAV]: JSON.stringify(NAV_FIXTURE, null, 2) + '\n',
  });
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t);

  const listed = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.data.files, ['index.md', 'start/01-join.md']);
  assert.deepEqual(listed.data.nav, NAV_FIXTURE);
  assert.equal(listed.data.navSha, gh.files.get(NAV).sha);
  assert.equal(listed.data.repo, REPO);
  assert.equal(listed.data.branch, BRANCH);
  assert.equal(listed.headers.get('cache-control'), 'no-store');

  // 没有 wiki.json 时返回空导航
  gh.files.delete(NAV);
  const empty = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.nav, { sections: [] });
  assert.equal(empty.data.navSha, null);
});

test('GET /api/wiki/file returns content/sha/url and rejects unsafe or non-whitelisted paths', async t => {
  const content = '---\nlayout: ../../layouts/WikiLayout.astro\n---\n\n中文正文\n';
  const gh = createGithubMock({ [MD + 'start/01-join.md']: content });
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t);

  const ok = await call('GET', '/api/wiki/file?path=' + encodeURIComponent('start/01-join.md'), { token: tokens.admin });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.path, 'start/01-join.md');
  assert.equal(ok.data.content, content);
  assert.equal(ok.data.sha, gh.files.get(MD + 'start/01-join.md').sha);
  assert.match(ok.data.url, new RegExp('^https://github.com/' + REPO + '/blob/main/'));

  // 带仓库前缀的完整路径也接受
  const full = await call('GET', '/api/wiki/file?path=' + encodeURIComponent(MD + 'start/01-join.md'), { token: tokens.admin });
  assert.equal(full.status, 200);
  assert.equal(full.data.path, 'start/01-join.md');

  assert.equal((await call('GET', '/api/wiki/file?path=' + encodeURIComponent('start/missing.md'), { token: tokens.admin })).status, 404);

  const badPaths = [
    '../../../etc/passwd',
    '/etc/passwd',
    'web/src/pages/wiki/../../index.md',
    'web\\src\\pages\\wiki\\index.md',
    'web/src/pages/wiki/%2e%2e/x.md',
    'web/src/pages/wiki/index.md/',
    'web/src/pages/wiki//index.md',
    'web/src/pages/wiki/index.html',
    'web/config.js',
    'web/start/index.md',
    '',
  ];
  for (const bad of badPaths) {
    const res = await call('GET', '/api/wiki/file?path=' + encodeURIComponent(bad), { token: tokens.admin });
    assert.equal(res.status, 400, 'expected 400 for ' + JSON.stringify(bad));
    assert.deepEqual(res.data, { error: '路径无效' });
  }

  assert.equal((await call('PUT', '/api/wiki/file', { token: tokens.admin, body: { path: '../../x.md', content: 'x' } })).status, 400);
  assert.equal((await call('DELETE', '/api/wiki/file', { token: tokens.admin, body: { path: '/etc/passwd', sha: 'x' } })).status, 400);
});

test('PUT /api/wiki/file creates and updates files with UTF-8 base64 and stale-sha conflicts', async t => {
  const oldContent = '# 旧标题\n';
  const gh = createGithubMock({ [MD + 'start/01-join.md']: oldContent });
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t);

  const read = await call('GET', '/api/wiki/file?path=' + encodeURIComponent('start/01-join.md'), { token: tokens.admin });
  const oldSha = read.data.sha;
  const newContent = '---\ntitle: 加入服务器\n---\n\n第一行中文\n第二行 emoji 🎮\n';

  const updated = await call('PUT', '/api/wiki/file', {
    token: tokens.admin,
    body: { path: 'start/01-join.md', content: newContent, sha: oldSha },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.ok, true);
  assert.match(updated.data.commit, /^commit-/);
  assert.match(updated.data.url, new RegExp('^https://github.com/' + REPO + '/blob/main/'));

  const put = lastPut(gh);
  assert.equal(put.url.pathname, '/repos/' + REPO + '/contents/' + MD + 'start/01-join.md');
  assert.equal(put.body.branch, BRANCH);
  assert.equal(put.body.sha, oldSha);
  assert.equal(put.body.message, 'wiki: 更新 start/01-join.md');
  assert.equal(Buffer.from(put.body.content, 'base64').toString('utf8'), newContent);
  assert.equal(gh.files.get(MD + 'start/01-join.md').raw.toString('utf8'), newContent);
  assert.equal(put.headers['User-Agent'], 'mc-map-server');
  assert.equal(put.headers.Accept, 'application/vnd.github+json');
  assert.equal(put.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(put.headers.Authorization, 'Bearer ghp_test');

  // GET 时带上了 branch
  const getCall = gh.calls.find(c => c.method === 'GET' && c.url.pathname.includes('/contents/'));
  assert.equal(getCall.url.searchParams.get('ref'), BRANCH);

  // sha 不符 → 409
  const stale = await call('PUT', '/api/wiki/file', {
    token: tokens.admin,
    body: { path: 'start/01-join.md', content: '# 覆盖\n', sha: 'deadbeef' },
  });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data, { error: CONFLICT_MSG });

  // 已存在文件但不带 sha → 409（避免误覆盖）
  const noSha = await call('PUT', '/api/wiki/file', {
    token: tokens.admin,
    body: { path: 'start/01-join.md', content: '# 覆盖\n' },
  });
  assert.equal(noSha.status, 409);

  // 新建文件：不带 sha，commit message 为「新建」
  const created = await call('PUT', '/api/wiki/file', {
    token: tokens.admin,
    body: { path: 'start/06-new-page.md', content: '---\ntitle: 新页面\n---\n\n内容\n' },
  });
  assert.equal(created.status, 200);
  assert.equal(lastPut(gh).body.message, 'wiki: 新建 start/06-new-page.md');
  assert.ok(gh.files.has(MD + 'start/06-new-page.md'));

  // 路径非法 / 内容缺失
  assert.equal((await call('PUT', '/api/wiki/file', { token: tokens.admin, body: { path: 'start/01-join.md', content: 42 } })).status, 400);
});

test('DELETE /api/wiki/file enforces sha and removes the blob', async t => {
  const gh = createGithubMock({ [MD + 'reference/report.md']: '# 反馈\n' });
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t);

  const read = await call('GET', '/api/wiki/file?path=' + encodeURIComponent('reference/report.md'), { token: tokens.admin });
  const sha = read.data.sha;

  const missingSha = await call('DELETE', '/api/wiki/file', { token: tokens.admin, body: { path: 'reference/report.md' } });
  assert.equal(missingSha.status, 400);

  const stale = await call('DELETE', '/api/wiki/file', { token: tokens.admin, body: { path: 'reference/report.md', sha: 'deadbeef' } });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data, { error: CONFLICT_MSG });
  assert.ok(gh.files.has(MD + 'reference/report.md'));

  const removed = await call('DELETE', '/api/wiki/file', { token: tokens.admin, body: { path: 'reference/report.md', sha } });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.ok, true);
  assert.match(removed.data.commit, /^commit-/);
  assert.equal(gh.files.has(MD + 'reference/report.md'), false);
  const del = [...gh.calls].reverse().find(c => c.method === 'DELETE');
  assert.equal(del.body.sha, sha);
  assert.equal(del.body.branch, BRANCH);
  assert.equal(del.body.message, 'wiki: 删除 reference/report.md');

  const gone = await call('DELETE', '/api/wiki/file', { token: tokens.admin, body: { path: 'reference/report.md', sha } });
  assert.equal(gone.status, 404);
});

test('PUT /api/wiki/nav validates structure and writes stable formatted JSON', async t => {
  const gh = createGithubMock({});
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t);

  const invalidNavs = [
    null,
    {},
    { sections: {} },
    { sections: [{}] },
    { sections: [{ key: 'start', label: '新手线' }] },
    { sections: [{ key: '', label: '新手线', pages: [] }] },
    { sections: [{ key: 'start', label: '', pages: [] }] },
    { sections: [{ key: 'start', label: '新手线', pages: [{ slug: 'Bad Slug', label: 'x' }] }] },
    { sections: [{ key: 'start', label: '新手线', pages: [{ slug: 'start/index' }] }] },
  ];
  for (const nav of invalidNavs) {
    const res = await call('PUT', '/api/wiki/nav', { token: tokens.admin, body: { nav } });
    assert.equal(res.status, 400, 'expected 400 for ' + JSON.stringify(nav));
  }

  const nav = {
    sections: [
      {
        key: 'start',
        label: '新手线',
        tag: 'START',
        pages: [
          { slug: 'start/index', label: '新手线总览', short: '总览' },
          { slug: 'start/01-join', label: '01 加入服务器', short: '01 加入' },
        ],
      },
    ],
  };
  const created = await call('PUT', '/api/wiki/nav', { token: tokens.admin, body: { nav } });
  assert.equal(created.status, 200);
  assert.equal(created.data.ok, true);
  assert.match(created.data.commit, /^commit-/);

  const put = lastPut(gh);
  assert.equal(put.url.pathname, '/repos/' + REPO + '/contents/' + NAV);
  assert.equal(put.body.branch, BRANCH);
  assert.equal(put.body.message, 'wiki: 更新导航');
  assert.equal(Buffer.from(put.body.content, 'base64').toString('utf8'), JSON.stringify(nav, null, 2) + '\n');
  assert.equal(gh.files.get(NAV).raw.toString('utf8'), JSON.stringify(nav, null, 2) + '\n');

  const listed = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.deepEqual(listed.data.nav, nav);
  assert.equal(listed.data.navSha, gh.files.get(NAV).sha);

  // sha 冲突
  const stale = await call('PUT', '/api/wiki/nav', {
    token: tokens.admin,
    body: { nav, sha: 'deadbeef' },
  });
  assert.equal(stale.status, 409);

  const nextNav = { sections: [{ key: 'map', label: '地图', tag: 'MAP', pages: [{ slug: 'map/overview', label: '分布图', short: '分布' }] }] };
  const updated = await call('PUT', '/api/wiki/nav', {
    token: tokens.admin,
    body: { nav: nextNav, sha: gh.files.get(NAV).sha },
  });
  assert.equal(updated.status, 200);
  assert.deepEqual((await call('GET', '/api/wiki/list', { token: tokens.admin })).data.nav, nextNav);
});

test('POST /api/wiki/image accepts raster images only and generates the server filename', async t => {
  const gh = createGithubMock({});
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t);

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const uploaded = await call('POST', '/api/wiki/image', {
    token: tokens.admin,
    raw: png,
    contentType: 'image/png',
  });
  assert.equal(uploaded.status, 201);
  const name = uploaded.data.path.slice('web/public/wiki/img/'.length);
  assert.match(name, /^wiki-\d{8}-\d{6}-[a-z0-9]{6}\.png$/);
  assert.equal(uploaded.data.url, '/wiki/img/' + name);
  assert.equal(uploaded.data.path, 'web/public/wiki/img/' + name);

  const put = lastPut(gh);
  assert.equal(put.url.pathname, '/repos/' + REPO + '/contents/web/public/wiki/img/' + name);
  assert.equal(put.body.branch, BRANCH);
  assert.equal(put.body.message, 'wiki: 上传图片 ' + name);
  assert.deepEqual(Buffer.from(put.body.content, 'base64'), Buffer.from(png));
  assert.deepEqual(gh.files.get(uploaded.data.path).raw, Buffer.from(png));

  // 客户端文件名被忽略：使用服务端生成名
  const another = await call('POST', '/api/wiki/image', {
    token: tokens.admin,
    raw: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    contentType: 'image/jpeg',
  });
  assert.equal(another.status, 201);
  assert.match(another.data.path, /^web\/public\/wiki\/img\/wiki-\d{8}-\d{6}-[a-z0-9]{6}\.jpg$/);
  assert.notEqual(another.data.path, uploaded.data.path);

  const svg = await call('POST', '/api/wiki/image', {
    token: tokens.admin,
    raw: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    contentType: 'image/svg+xml',
  });
  assert.equal(svg.status, 415);
  assert.deepEqual(svg.data, { error: '仅支持 PNG / JPEG / WebP / GIF 图片' });

  const huge = await call('POST', '/api/wiki/image', {
    token: tokens.admin,
    raw: new Uint8Array(4 * 1024 * 1024 + 1),
    contentType: 'image/png',
  });
  assert.equal(huge.status, 413);
  assert.deepEqual(huge.data, { error: '图片不能超过 4MB' });

  const empty = await call('POST', '/api/wiki/image', {
    token: tokens.admin,
    raw: new Uint8Array(0),
    contentType: 'image/png',
  });
  assert.equal(empty.status, 400);

  // 未登录时不会触达 GitHub
  const before = gh.calls.length;
  assert.equal((await call('POST', '/api/wiki/image', { raw: png, contentType: 'image/png' })).status, 401);
  assert.equal(gh.calls.length, before);
});

test('all wiki routes return 503 when GITHUB_TOKEN is not configured', async t => {
  const gh = createGithubMock({});
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t, { token: '', repo: REPO, branch: BRANCH });

  for (const [method, apiPath, extra] of [
    ['GET', '/api/wiki/list', {}],
    ['GET', '/api/wiki/file?path=index.md', {}],
    ['PUT', '/api/wiki/file', { body: { path: 'index.md', content: '# x' } }],
    ['DELETE', '/api/wiki/file', { body: { path: 'index.md', sha: 'x' } }],
    ['PUT', '/api/wiki/nav', { body: { nav: { sections: [] } } }],
    ['POST', '/api/wiki/image', { raw: new Uint8Array([1]), contentType: 'image/png' }],
  ]) {
    const res = await call(method, apiPath, { token: tokens.admin, ...extra });
    assert.equal(res.status, 503, method + ' ' + apiPath);
    assert.deepEqual(res.data, { error: '未配置 GITHUB_TOKEN（请在 Cloudflare Worker 添加 Secret 后重新部署）' });
  }
  assert.equal(gh.calls.length, 0);
});

test('GitHub authentication and server errors map to 502 without leaking details', async t => {
  const gh = createGithubMock({ [MD + 'index.md']: '# 首页' });
  t.mock.method(globalThis, 'fetch', gh.fetch);
  const { call } = await fixture(t);

  gh.state.failStatus = 401;
  const unauthorized = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.equal(unauthorized.status, 502);
  assert.deepEqual(unauthorized.data, { error: 'GitHub 鉴权失败，请检查 GITHUB_TOKEN' });

  gh.state.failStatus = 403;
  assert.deepEqual((await call('GET', '/api/wiki/list', { token: tokens.admin })).data, {
    error: 'GitHub 鉴权失败，请检查 GITHUB_TOKEN',
  });

  gh.state.failStatus = 500;
  const broken = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.equal(broken.status, 502);
  assert.deepEqual(broken.data, { error: 'GitHub 请求失败（HTTP 500）' });
});

test('network failures and GitHub timeouts become 502 responses', async t => {
  let mode = 'network';
  t.mock.method(globalThis, 'fetch', async () => {
    if (mode === 'timeout') {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
    throw new TypeError('fetch failed');
  });
  const { call } = await fixture(t);

  const offline = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.equal(offline.status, 502);
  assert.deepEqual(offline.data, { error: '无法连接 GitHub，请稍后重试' });

  mode = 'timeout';
  const timedOut = await call('GET', '/api/wiki/list', { token: tokens.admin });
  assert.equal(timedOut.status, 502);
  assert.deepEqual(timedOut.data, { error: 'GitHub 请求超时，请稍后重试' });
});
