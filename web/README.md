# web —— 一辈子存档 · MC 服务器网站（Astro）

把 [mc-map-server](https://github.com/xiaoxingxing2896-ctrl/mc-map-server) 的地图应用与
[RyuChan](https://github.com/kobaridev/RyuChan) 设计语言整合为一个静态站：

| 路由 | 页面 |
| --- | --- |
| `/` | 地图首页：直接嵌入 `../public/index.html`（上游地图应用源码，保持零改动），套上站点外壳与 `map-theme.css` 圆角玻璃风格 |
| `/about/` | 服务器介绍（RyuChan 风格横幅 + 卡片，内容来自 `src/data/site.json`） |
| `/history/` | 历程记录（时间轴；图片放 `public/history/`，命名 `YYYY-MM-DD_标题_作者1,作者2.webp`） |
| `/thanks/` | 特别鸣谢（名单在 `site.json` 的 `thanks`，开源项目为固定三条） |
| `/account/` | 账号入口：登录 / 注册 / 邮箱验证 / 忘记密码 合并为一个入口，与地图共用 `mcmap_token` 等存储键与全部 `/api/auth/*` 接口；登录成功默认返回地图 |
| 404 | 未找到页 |

## 本地运行

```bash
# 终端 1：地图后端（Node 版即可；或 cd ../worker && npx wrangler dev）
cd .. && npm ci && cp .env.example .env   # 按需填 JWT_SECRET / ADMIN_PASSWORD
PORT=8787 npm start                        # 供 astro dev 代理

# 终端 2：本网站
cd web
npm install
npm run dev        # http://localhost:4321 ，/api 与 /tiles 自动代理到 127.0.0.1:8787
```

说明：
- 地图 UI 上游文件是仓库根目录的 `public/index.html`；`web/src/pages/index.astro` 在构建期读取它
  并注入外壳，所以**地图功能的更新仍改仓库根 `public/`**，无需改动本站代码。
- `web/public/vendor/` 是本地化的 Leaflet（脱 CDN）；`web/public/images/banner.webp` 为介绍页横幅
  （取自 Wan's Mcweb 模板素材，按 MIT/仓库许可使用，见致谢页）。
- `web/public/map-integration.js` 负责：把被注入但未执行的地图脚本按序重新执行、容器内
  Leaflet 尺寸校准、左下角状态胶囊（在线/标注数/未连接）。

## 常用站点配置

`src/data/site.json`：
- `name` / `description` / `introduction`：站名与介绍
- `address` / `version` / `joinUrl`：加入服务器信息（留空则页面显示"联系管理员"）
- `history` / `thanks`：也可直接写在 JSON（`history` 项见 `src/data/history.ts` 的 `HistoryItem`）

## 构建与部署（Cloudflare）

```bash
npm run build          # 产物 dist/
```

### 方式 A（推荐）：并入原仓库，由同一个 Worker 承载（Worker + D1 + R2 全部不动）

本站设计为「原仓库的子目录」：`worker/wrangler.toml` 的 `[assets].directory` 已从
`../public` 改为 `../web/dist`。Worker 代码（`/api`、`/tiles`、邮箱验证、D1/R2）零改动，
静态站由 Workers Assets 承载，因此：

- 部署仍只推这一个 Worker：`npm run site:deploy`（= 构建 web + `cd worker && wrangler deploy`）
- D1 数据库、R2 瓦片桶、`JWT_SECRET / RESEND_API_KEY / MAIL_FROM / TURNSTILE_SECRET_KEY` 等
  secrets、自定义域名全部保持不变
- 地图首页、`/api/*`、`/tiles/*` 天然同源，不需要 Pages/转发层
- 回退旧版纯地图页：把 `wrangler.toml` 的 `directory` 改回 `../public` 重新部署即可

```bash
# 部署机：先登录一次
npx wrangler login            # 或 npm i -g wrangler
# 每次更新站点
npm run site:deploy           # 构建 web/dist 并部署
```

> 注意：地图应用的上游单页仍是仓库根 `public/index.html`（构建期被首页嵌入）。升级地图
> 功能后需重新执行 `npm run site:build`，改动才会进入线上。
> 域名若被浏览器缓存，部署后强制刷新（或等 CF 边缘缓存自然过期，静态资源带版本头）。

### 方式 B：Cloudflare Pages + 转发 Functions（独立托管时）

1. `wrangler pages deploy dist --project-name mc-map-site`（或直接在 CF 面板连 Git 仓库，
   构建命令 `npm run build`，输出目录 `dist`，项目根目录填 `web`）。
2. 给 Pages 绑定自定义域名（与你的地图后端域名同一 zone 即可）。
3. **关键**：设置环境变量 `MAP_API_ORIGIN = https://你的地图Worker域名`（不带尾斜杠）。
   仓库自带的 `functions/api/[[path]].ts` 与 `functions/tiles/[[path]].ts` 会把
   `/api/*`、`/tiles/*` 同源转发到该 Worker——地图前端全部同源请求因此不变。
4. 若不用环境变量，直接把 `functions/_proxy.ts` 顶部 `DEFAULT_ORIGIN` 改成你的 Worker 域名再部署。

> 为什么不把 Worker 与 Pages 同时绑定同一域名根？Cloudflare 不允许两者路由同路径重叠；
> 用 Pages Functions 转发是官方支持的组合方式（也可改用 Pages 的 *Service Bindings*，见 CF 文档）。

### 方式 C：Node 版一体托管（VPS + Tunnel，适合未启用 Worker 时）

仓库根目录自带的 Node 服务（`server.js`）已同时提供 `/api`、`/tiles` 与地图页。
若要把本静态站与它同源：把 `dist/` 内容拷到 Node 版 `public/`（地图 `index.html` 由本站首页
替代后，原入口保留在 `public/index.html` 之外即可，或二选一），再按仓库根 README 的
Tunnel 方式暴露。API 域名仍由同一服务提供，无需转发层。

## 里程碑（接力自 ChatGPT 共享会话）

- [x] 地图首页外壳 + 地图 UI 适配（map-theme.css）
- [x] 介绍 / 历程 / 致谢 / 404
- [x] `map-integration.js`（会话中已引用、未落盘的缺失件）
- [x] `/account/` 账号入口（会话最后需求：登录注册合并为单一入口，关联地图登录态）
- [x] 导航加入"账号"入口
- [x] 并入原仓库：Worker Assets 改为承载 `web/dist`（`worker/wrangler.toml`），D1/R2/secrets 不动
- [ ] 真机/浏览器全流程回归（导入后请在手机上实际走一遍注册→验证→登录→标注）
- [ ] 填入真实历程图片与鸣谢名单（`public/history/` 与 `site.json`）
- [ ] 线上域名配置与正式部署（`npm run site:deploy`）
