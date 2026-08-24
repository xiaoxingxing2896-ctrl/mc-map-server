/**
 * 拉取前端静态资源到 public/vendor（部署机需有外网，一次性执行：npm run fetch-vendor）。
 * 当前拉取 Leaflet 1.9.4（js + css），多 CDN 源自动回退。
 * 前端优先加载本地 vendor 文件，缺失时自动回退 unpkg CDN，因此本脚本不是必需步骤。
 */
const fs = require('fs');
const path = require('path');

const VENDOR_DIR = path.join(__dirname, '..', 'public', 'vendor');
const FILES = {
  'leaflet.js': [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
  ],
  'leaflet.css': [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  ],
};

async function fetchFile(name) {
  for (const url of FILES[name]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(VENDOR_DIR, name), buf);
      console.log(`OK  ${name} <- ${url} (${buf.length} bytes)`);
      return true;
    } catch (e) {
      console.log(`FAIL ${name} <- ${url}: ${e.message}`);
    }
  }
  return false;
}

async function main() {
  if (!fs.existsSync(VENDOR_DIR)) fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const results = await Promise.all(Object.keys(FILES).map(fetchFile));
  const ok = results.every(Boolean);
  console.log(ok ? '全部资源就绪。' : '部分资源下载失败：请检查服务器网络，或保留 CDN 回退模式。');
  process.exit(ok ? 0 : 1);
}

main();