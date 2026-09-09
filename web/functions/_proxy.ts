/* Pages Functions 转发辅助：把 /api/* 与 /tiles/* 代理到现有地图后端 Worker。
 * 地图前端所有请求都是同源相对路径，因此静态站点与后端必须同源：
 * 方案 = Cloudflare Pages 托管本站 + 该转发层 + 环境变量 MAP_API_ORIGIN（后端 Worker 的自定义域名）。
 * 部署见 web/README.md。
 */
interface Env { MAP_API_ORIGIN?: string }

const DEFAULT_ORIGIN = 'https://mc-map-server.example.workers.dev';

export async function proxyToOrigin(context: EventContext<Env, string, unknown>): Promise<Response> {
  const origin = (context.env.MAP_API_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
  const url = new URL(context.request.url);
  const target = origin + url.pathname + url.search;

  const headers = new Headers(context.request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-proto');

  const method = context.request.method;
  const init: RequestInit = { method, headers, redirect: 'follow' };
  if (method !== 'GET' && method !== 'HEAD' && context.request.body) {
    init.body = context.request.body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return new Response(JSON.stringify({ error: '地图后端暂不可用' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const outHeaders = new Headers(upstream.headers);
  // 瓦片与 vendor 可长缓存；接口默认不缓存
  if (url.pathname.startsWith('/tiles/')) outHeaders.set('cache-control', 'public, max-age=604800');
  else if (!outHeaders.has('cache-control')) outHeaders.set('cache-control', 'no-cache');

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: outHeaders });
}
