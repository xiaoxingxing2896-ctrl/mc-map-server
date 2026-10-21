// Wiki 编辑器后端：鉴权 + 路径白名单 + GitHub 读写。
// 接口契约见 .tmp/wiki-cms-contract.md（冻结版）。
import { authenticateReq } from './routes.js';
import { createGithub } from './github.js';

const MD_PREFIX = 'web/src/pages/wiki/';
const NAV_PATH = 'web/src/data/wiki.json';
const IMG_PREFIX = 'web/public/wiki/img/';
const DEFAULT_REPO = 'xiaoxingxing2896-ctrl/mc-map-server';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const CONFLICT_MSG = '文件已被修改，请刷新后重试';

// 契约中的白名单（相对仓库根目录）
const MD_RE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.md$/;
const NAV_RE = /^[a-z0-9\-_/]+$/;
const IMG_RE = /^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|gif)$/;
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_PATH_LENGTH = 200;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// 任何含 ..、反斜杠、空段、编码字符、绝对路径的输入一律判为无效。
function isSafePathText(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    !value.includes('..') &&
    !value.includes('\\') &&
    !value.includes('%') &&
    !value.includes('//') &&
    !value.startsWith('/') &&
    !value.includes('\0') &&
    !/\s/.test(value)
  );
}

// 接受相对路径（start/01-join.md）或带前缀的仓库路径（web/src/pages/wiki/...）。
function normalizeMarkdown(input) {
  if (!isSafePathText(input)) return null;
  let rel = input;
  if (rel.startsWith(MD_PREFIX)) rel = rel.slice(MD_PREFIX.length);
  else if (rel.startsWith('web/')) return null;
  if (!MD_RE.test(rel)) return null;
  return { rel, full: MD_PREFIX + rel };
}

function validateNav(nav) {
  if (!nav || typeof nav !== 'object' || Array.isArray(nav)) return '导航数据无效';
  if (!Array.isArray(nav.sections)) return '导航 sections 必须是数组';
  for (const section of nav.sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return '导航栏目格式无效';
    if (typeof section.key !== 'string' || section.key.trim() === '') return '导航栏目缺少 key';
    if (typeof section.label !== 'string' || section.label.trim() === '') return '导航栏目缺少 label';
    if (section.tag !== undefined && typeof section.tag !== 'string') return '导航栏目 tag 无效';
    if (!Array.isArray(section.pages)) return '导航栏目 pages 必须是数组';
    for (const page of section.pages) {
      if (!page || typeof page !== 'object' || Array.isArray(page)) return '导航页面格式无效';
      if (typeof page.slug !== 'string' || !NAV_RE.test(page.slug)) return '导航 slug 无效';
      if (typeof page.label !== 'string' || page.label.trim() === '') return '导航页面缺少 label';
      if (page.short !== undefined && typeof page.short !== 'string') return '导航页面 short 无效';
    }
  }
  return null;
}

// 统一鉴权：Bearer token + 数据库中的当前角色（旧 token 不保留提权）。
async function requireEditor(req, ctx) {
  let user;
  try {
    ({ user } = await authenticateReq(req, ctx));
  } catch (e) {
    if (e && e.status === 401) return { error: json({ error: '请先登录' }, 401) };
    return { error: json({ error: '权限不足' }, 403) };
  }
  const row = await ctx.db.get('SELECT role FROM users WHERE id = ?', [user.id]);
  if (!row || !['admin', 'owner'].includes(row.role)) {
    return { error: json({ error: '权限不足' }, 403) };
  }
  return { user: { ...user, role: row.role } };
}

function githubContext(ctx) {
  const cfg = ctx.github || {};
  if (!cfg.token) return { error: json({ error: '未配置 GITHUB_TOKEN（请在 Cloudflare Worker 添加 Secret 后重新部署）' }, 503) };
  return {
    client: createGithub({
      token: cfg.token,
      repo: cfg.repo || DEFAULT_REPO,
      branch: cfg.branch || 'main',
    }),
    repo: cfg.repo || DEFAULT_REPO,
    branch: cfg.branch || 'main',
  };
}

async function guard(req, ctx) {
  const auth = await requireEditor(req, ctx);
  if (auth.error) return auth;
  const gh = githubContext(ctx);
  if (gh.error) return gh;
  return { user: auth.user, client: gh.client, repo: gh.repo, branch: gh.branch };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function imageFileName(ext) {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (const b of bytes) rand += alphabet[b % alphabet.length];
  return `wiki-${stamp}-${rand}.${ext}`;
}

// ---------- 1) GET /api/wiki/list ----------
export async function listWiki(req, ctx) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const [navFile, tree] = await Promise.all([
    g.client.getJson(NAV_PATH),
    g.client.listTree(MD_PREFIX),
  ]);
  let nav = { sections: [] };
  if (navFile && navFile.data && typeof navFile.data === 'object' && !Array.isArray(navFile.data)) {
    nav = navFile.data;
    if (!Array.isArray(nav.sections)) nav.sections = [];
  }
  const files = tree
    .filter(p => p.endsWith('.md'))
    .map(p => p.slice(MD_PREFIX.length))
    .filter(rel => rel && !rel.split('/').some(seg => seg.startsWith('_')))
    .sort();
  return json({
    nav,
    files,
    navSha: navFile ? navFile.sha : null,
    repo: g.repo,
    branch: g.branch,
  });
}

// ---------- 2) GET /api/wiki/file?path= ----------
export async function getWikiFile(req, ctx) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const target = normalizeMarkdown(new URL(req.url).searchParams.get('path') || '');
  if (!target) return json({ error: '路径无效' }, 400);
  const file = await g.client.getFile(target.full);
  if (!file) return json({ error: '文件不存在' }, 404);
  return json({ path: target.rel, content: file.content, sha: file.sha, url: file.html_url });
}

// ---------- 3) PUT /api/wiki/file ----------
export async function putWikiFile(req, ctx) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const target = normalizeMarkdown(body && body.path);
  if (!target) return json({ error: '路径无效' }, 400);
  if (typeof body.content !== 'string') return json({ error: '内容无效' }, 400);
  const sha = typeof body.sha === 'string' && body.sha ? body.sha : '';
  const current = await g.client.getFile(target.full);
  if (sha) {
    if (!current || current.sha !== sha) return json({ error: CONFLICT_MSG }, 409);
  } else if (current) {
    return json({ error: CONFLICT_MSG }, 409);
  }
  const message = current ? `wiki: 更新 ${target.rel}` : `wiki: 新建 ${target.rel}`;
  const result = await g.client.putFile(target.full, body.content, sha, message);
  return json({ ok: true, commit: result.commit, url: result.url });
}

// ---------- 4) DELETE /api/wiki/file ----------
export async function deleteWikiFile(req, ctx) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const target = normalizeMarkdown(body && body.path);
  if (!target) return json({ error: '路径无效' }, 400);
  if (typeof body.sha !== 'string' || body.sha === '') return json({ error: '缺少 sha' }, 400);
  const current = await g.client.getFile(target.full);
  if (!current) return json({ error: '文件不存在' }, 404);
  if (current.sha !== body.sha) return json({ error: CONFLICT_MSG }, 409);
  const result = await g.client.deleteFile(target.full, body.sha, `wiki: 删除 ${target.rel}`);
  return json({ ok: true, commit: result.commit });
}

// ---------- 5) PUT /api/wiki/nav ----------
export async function putWikiNav(req, ctx) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const problem = validateNav(body && body.nav);
  if (problem) return json({ error: problem }, 400);
  const sha = typeof body.sha === 'string' && body.sha ? body.sha : '';
  const current = await g.client.getFile(NAV_PATH);
  if (sha) {
    if (!current || current.sha !== sha) return json({ error: CONFLICT_MSG }, 409);
  } else if (current) {
    return json({ error: CONFLICT_MSG }, 409);
  }
  const result = await g.client.putJson(NAV_PATH, body.nav, sha, 'wiki: 更新导航');
  return json({ ok: true, commit: result.commit, url: result.url });
}

// ---------- 6) POST /api/wiki/image ----------
export async function uploadWikiImage(req, ctx) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) return json({ error: '仅支持 PNG / JPEG / WebP / GIF 图片' }, 415);
  let bytes;
  try {
    bytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return json({ error: '图片读取失败' }, 400);
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: '图片不能超过 4MB' }, 413);
  if (bytes.byteLength === 0) return json({ error: '图片内容为空' }, 400);
  const name = imageFileName(ext);
  if (!IMG_RE.test(name)) return json({ error: '文件名无效' }, 400);
  const fullPath = IMG_PREFIX + name;
  await g.client.putFile(fullPath, bytes, undefined, `wiki: 上传图片 ${name}`);
  return json({ url: `/wiki/img/${name}`, path: fullPath }, 201);
}
