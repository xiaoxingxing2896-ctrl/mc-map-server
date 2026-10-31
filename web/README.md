# web —— MareCraft · MC 服务器网站（Astro）

把 [mc-map-server](https://github.com/xiaoxingxing2896-ctrl/mc-map-server) 的地图应用与
[RyuChan](https://github.com/kobaridev/RyuChan) 设计语言整合为一个静态站：

| 路由 | 页面 |
| --- | --- |
| `/` | 地图首页：直接嵌入 `../public/index.html`（上游地图应用源码，保持零改动），套上站点外壳与 `map-theme.css` 圆角玻璃风格 |
| `/about/` | 服务器介绍（RyuChan 风格横幅 + 卡片，内容来自 `src/data/site.json`） |
| `/history/` | 历程记录：**博客式相册**，任意登录玩家可发图文（`/api/posts`，图片走 R2 `photos/`），详见下文 |
| `/thanks/` | 特别鸣谢（名单在 `site.json` 的 `thanks`，开源项目为固定三条） |
| `/account/` | 账号入口：登录 / 注册 / 邮箱验证 / 忘记密码 合并为一个入口，与地图共用 `mcmap_token` 等存储键与全部 `/api/auth/*` 接口；登录成功默认返回地图 |
| `/transit/` | 交通线路：下界交通示意图，数据驱动 SVG（`web/public/nether-map/`），可点站看详情、缩放平移；`?edit=1` 才显示编辑入口 |
| `/upload/` | 上传瓦片：仅 admin / owner。列瓦片、上传 1024×1024 PNG（`PUT /api/tiles`）、删除（`DELETE /api/tiles`） |
| `/wiki/` | 服务器 Wiki：新手线 / 设施手册 / 地图 / 参考，Markdown 页面 + `WikiLayout`（左目录树、面包屑） |
| 404 | 未找到页 |

## Wiki 目录

`web/src/pages/wiki/` 下是纯 Markdown（frontmatter 指向 `WikiLayout`），新增页面只需加文件：

```
wiki/index.md                    首页：设施分布示意图 + 三个入口
wiki/start/                      新手线：总览 / 01 加入 / 02 第一小时 / 03 规则 / 04 指令 / 05 提问
wiki/facilities/                 设施手册：总表（状态筛选 + 搜索）/ 村民交易所 / 铁农场 / 经验农场 / _template
wiki/map/overview.md             带编号的设施分布图
wiki/reference/                  术语表 / 装备与附魔 / 变更日志 / 反馈与报错
```

- `_template.md` 以下划线开头，不生成路由，只作模板。
- 目录树写死在 `web/src/layouts/WikiLayout.astro` 的 `groups` 里，加页面要同步加一项。
- 服务器地址、版本、管理员、设施坐标等信息统一写「以群公告为准 / 待补充」，避免文档过期误导。

## 上传瓦片与删除

`/upload/` 只对 `admin` 与 `owner` 开放（前端按 `/api/me` 的角色显示管理台，后端二次校验数据库中的当前角色）：

| 操作 | 请求 | 说明 |
|---|---|---|
| 列表 | `GET /api/tiles?world=` | 返回坐标、URL、版本（etag） |
| 上传 | `PUT /api/tiles?world=&name=x<X>_z<Z>.png&mode=add\|replace` | 1024×1024 PNG、≤8MB；替换上传层需 `If-Match` |
| 删除 | `DELETE /api/tiles?world=&name=` | 先删 `_uploads` 覆盖层，再删基础层；成功返回 `removed` |

> 删除接口是新增的 Worker 路由，需要重新部署 Worker 才生效（只更新静态站不够）。

## 历程记录（/history/，博客式相册）

页面本身是静态壳，内容在浏览器里向 `/api/posts` 取，因此**发一篇不用重新构建站点**：

| 操作 | 请求 | 权限 |
|---|---|---|
| 列表 | `GET /api/posts?limit=&offset=` | 公开 |
| 发布 | `POST /api/posts` `{title, body}` | 任意登录玩家 |
| 改 / 删 | `PUT` / `DELETE /api/posts/:id` | 作者本人、admin、owner |
| 加图 | `PUT /api/posts/:id/photos?name=`（raw body，`image/png\|jpeg\|webp`） | 同上 |
| 删图 | `DELETE /api/posts/:id/photos?key=` | 同上 |
| 取图 | `GET /photos/<key>` | 公开，7 天缓存 |

- 图片存 R2 `photos/<postId>/…`（Express 版存 `config.photosDir`，默认 `photos/`），**与 `/tiles/` 瓦片完全隔离**；
- 服务端只认文件头：PNG / JPEG / WebP，单张 ≤ 10 MB，每篇最多 12 张，标题 ≤ 80 字、正文 ≤ 5000 字；
- 页面上所有文字都用 `textContent` 写入，不拼接 HTML，正文按纯文本保留换行。

## 交通线路

`/transit/` 用 `web/public/nether-map/` 下的自定义元素渲染：

- `nether-map.js`：组件（渲染 / 缩放 / 选中 / 编辑 / 导出），无依赖；
- `nether-map-data.js`：线路、站点与坐标，**改数据即改图**；
- 公开页面隐藏编辑入口，维护时访问 `/transit/?edit=1`；编辑结果存在浏览器 localStorage，需要长期保存请导出 JSON 后覆盖数据文件。

## Wiki 编辑器（/wiki/edit/）

给 admin / owner 用的站内 CMS，不需要本地仓库和 Git 命令：

| 能力 | 落点 |
|---|---|
| 编辑页面正文 | `web/src/pages/wiki/<slug>.md` |
| 新建页面 / 删除页面 | 同上，并同步更新目录 |
| 新建栏目 | `web/src/data/wiki.json` 的 `sections` |
| 改显示名（左侧菜单文字） | `web/src/data/wiki.json` 的 `label` / `short` |
| 上传图片 | `web/public/wiki/img/`，引用路径 `/wiki/img/<name>` |

- 保存 = 调 Worker 的 `/api/wiki/*`，由 Worker 用 `GITHUB_TOKEN` 提交到 GitHub，触发 Actions 重建，约 1–2 分钟上线。
- 图片目录与地图瓦片（`/tiles/`、R2）完全隔离，不会被瓦片同步任务碰到。
- 更新已有文件必须带 sha（冲突返回 409，界面提示刷新），新建不带 sha。
- 未配置 token 时接口返回 503，页面给出明确提示。

接口契约见仓库根 README「Wiki 站内编辑」一节；后端在 `worker/wiki.js`（GitHub 客户端 `worker/github.js`）。

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
- `thanks`：致谢名单（历程记录已改为 `/api/posts` 动态内容，不再读 JSON）

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
- [x] 站点结构扩到 8 个栏目（介绍 / 历程 / 交通 / 地图 / 上传 / Wiki / 致谢 / 账号）
- [x] 历程记录改为博客式相册：任意登录玩家发图文，图片存 R2 `photos/`
- [ ] 真机/浏览器全流程回归（导入后请在手机上实际走一遍注册→验证→登录→标注→发历程）
- [ ] 填入真实鸣谢名单（`site.json`）
- [ ] 线上域名配置与正式部署（`npm run site:deploy`）
