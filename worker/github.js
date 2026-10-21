// GitHub Contents API 客户端（零依赖，Workers 可用）。
// 只暴露 Wiki 编辑器需要的最小能力：读文件 / 写文件 / 删文件 / 列目录 / JSON 辅助。
// 错误约定与契约一致：
//   401/403 → { status: 502, msg: 'GitHub 鉴权失败，请检查 GITHUB_TOKEN' }
//   404     → 返回 null（读）或抛 404（删）
//   409/422 → { status: 409, msg: '文件已被修改，请刷新后重试' }
//   其它    → { status: 502, msg: ... }

const API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 8000;
const USER_AGENT = 'mc-map-server';
const CONFLICT_MSG = '文件已被修改，请刷新后重试';

function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(String(text)));
}

function base64ToUtf8(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// 文本按 UTF-8 编码；Uint8Array / ArrayBuffer 直接按字节编码（图片上传用）。
function contentToBase64(content) {
  if (content instanceof Uint8Array) return bytesToBase64(content);
  if (content instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(content));
  return utf8ToBase64(content);
}

function mapErrorStatus(status) {
  if (status === 401 || status === 403) {
    return { status: 502, msg: 'GitHub 鉴权失败，请检查 GITHUB_TOKEN' };
  }
  if (status === 409 || status === 422) {
    return { status: 409, msg: CONFLICT_MSG };
  }
  return { status: 502, msg: `GitHub 请求失败（HTTP ${status}）` };
}

export function createGithub({ token = '', repo = '', branch = 'main' } = {}) {
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  };

  function encodePath(filePath) {
    return String(filePath).split('/').map(encodeURIComponent).join('/');
  }

  async function request(method, apiPath, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API_BASE}${apiPath}`, {
        method,
        headers: payload === undefined ? baseHeaders : { ...baseHeaders, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      throw {
        status: 502,
        msg: e && e.name === 'AbortError' ? 'GitHub 请求超时，请稍后重试' : '无法连接 GitHub，请稍后重试',
      };
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw mapErrorStatus(res.status);
    if (res.status === 204) return {};
    return res.json().catch(() => ({}));
  }

  async function getFile(filePath) {
    const data = await request(
      'GET',
      `/repos/${repo}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(branch)}`
    );
    if (!data) return null;
    const content = data.encoding === 'base64' && data.content ? base64ToUtf8(data.content) : '';
    return {
      path: data.path || filePath,
      content,
      sha: data.sha,
      html_url: data.html_url || '',
    };
  }

  async function putFile(filePath, content, sha, message) {
    const body = { message, content: contentToBase64(content), branch };
    if (sha) body.sha = sha;
    const data = await request('PUT', `/repos/${repo}/contents/${encodePath(filePath)}`, body);
    if (!data) throw { status: 502, msg: 'GitHub 仓库或分支不存在' };
    return {
      commit: (data.commit && data.commit.sha) || null,
      url: (data.content && data.content.html_url) || '',
    };
  }

  async function deleteFile(filePath, sha, message) {
    const data = await request('DELETE', `/repos/${repo}/contents/${encodePath(filePath)}`, {
      message,
      sha,
      branch,
    });
    if (!data) throw { status: 404, msg: '文件不存在' };
    return { commit: (data.commit && data.commit.sha) || null };
  }

  async function listTree(prefix) {
    const data = await request(
      'GET',
      `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );
    const tree = data && Array.isArray(data.tree) ? data.tree : [];
    return tree
      .filter(entry => entry && entry.type === 'blob' && typeof entry.path === 'string' && entry.path.startsWith(prefix))
      .map(entry => entry.path);
  }

  async function getJson(filePath) {
    const file = await getFile(filePath);
    if (!file) return null;
    try {
      return { data: JSON.parse(file.content), sha: file.sha };
    } catch {
      throw { status: 502, msg: 'GitHub 上的 JSON 数据格式错误' };
    }
  }

  async function putJson(filePath, obj, sha, message) {
    const text = `${JSON.stringify(obj, null, 2)}\n`;
    return putFile(filePath, text, sha, message);
  }

  return { getFile, putFile, deleteFile, listTree, getJson, putJson };
}
