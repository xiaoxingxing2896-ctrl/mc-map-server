# 🗺️ mc-map-server —— Minecraft 服务器地图 + 标注网站

原版功能的完整保留：瓦片地图浏览、登录、地图标注（公开/私有）、用户权限管理、坐标跳转。
本仓库为**优化改造版**：不改动任何功能与地图结构（瓦片命名/坐标体系、数据库表结构、API 路径与语义、前端交互），在安全、性能、工程化与云端部署方面做了增强。

## 功能一览

> **web/ —— 网站整合版（新，本仓库默认前端）**：以 RyuChan 设计语言包装本站地图为首页，新增「服务器介绍 / 历程记录 / 特别鸣谢 / 账号入口」页面与移动端适配，账号入口与地图共用登录状态与邮箱验证；Astro 静态站。已并入本仓库：`worker/wrangler.toml` 的 Assets 指向 `web/dist`（构建 `npm run site:build`，部署 `npm run site:deploy`，CI 自动完成），Worker + D1 + R2 与全部接口不变。详见 [web/README.md](web/README.md)。

原生 Android 地图客户端的功能、构建与管理员瓦片上传说明见 [android_native/README.md](android_native/README.md)。旧 Flutter 客户端保留在 `mobile_app/`。

原生 2.1 界面采用 Minecraft 方块风格，支持持久化主题、配色、圆角、纹理与字号设置，Wiki 直接接入 [中文 Minecraft Wiki](https://zh.minecraft.wiki/)，并完善密码输入、认证提示和客户端会话处理。

2026-09-08，原生客户端与管理员瓦片接口提交 `b7092ce` 已推送到 `main`，现有 Worker 已部署，原生 Android、后端与 Flutter CI 均通过。线上读取和手机安装启动的实际结果及未验证范围见 [构建与部署验证记录](android_native/VERIFICATION.md)。

- 俯视瓦片地图（Leaflet 渲染，MC 世界坐标直接映射，北朝上）
- 地图上打标注：标题 / 类别（7 类）/ 描述 / 自定义 Emoji 图标 / 公开或私有
- 侧栏标注列表：搜索、类别筛选、"仅我的标注"
- 坐标实时显示与坐标跳转
- 服务器在线玩家列表展示：普通玩家全量显示，匿名玩家单独分组并默认折叠
- 注册 / 登录（JWT）/ 修改账号信息
- 三角色权限：user < admin < owner，用户管理面板
- 首次启动自动创建 Owner 账号（可配置密码或随机生成）

## 项目结构

```
├── server.js              # 入口：中间件组装 + 路由挂载 + 启动
├── config.js              # 配置中心（环境变量 / .env / 默认值，零依赖）
├── src/
│   ├── db.js              # SQLite 初始化（表结构与原版一致）+ 默认 Owner 引导
│   ├── middleware.js      # authenticate / requireRole / optionalAuth
│   ├── security.js        # 安全响应头 + 内存限流（零依赖手写）
│   ├── logger.js          # 请求日志
│   └── routes/            # auth / users / tiles / markers 路由
├── public/                # 前端单页（index.html + vendor/）
├── worker/                # Serverless 版（零依赖 Workers + D1 + R2，见下方章节）
├── scripts/
│   ├── backup.js          # 数据库备份（保留最近 7 份）
│   ├── fetch-vendor.js    # 拉取 Leaflet 到本地（脱离 CDN）
│   └── smoke-test.js      # 全量回归冒烟测试（32 项）
├── cloudflared/           # Cloudflare Tunnel 配置示例
├── Dockerfile / docker-compose.yml / ecosystem.config.js
└── mcmap.db / tiles/      # 运行时数据（不变）
```

## 本地运行

```bash
npm install        # 已带 node_modules 可跳过
npm start          # http://localhost:3000
```

可选：`cp .env.example .env` 后填写配置。

## 配置项（.env）

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 监听端口 | 3000 |
| `JWT_SECRET` | JWT 签名密钥（生产必填，`openssl rand -base64 48`） | 随机生成（重启后登录失效） |
| `JWT_EXPIRES_IN` | 令牌有效期 | 7d |
| `ADMIN_PASSWORD` | 全新部署时初始 Owner 密码 | 随机生成并打印 |
| `DB_PATH` | SQLite 路径 | ./mcmap.db |
| `TILES_DIR` | 瓦片目录 | ./tiles |
| `TRUST_PROXY` | 前面有反代时置 1 | 0 |

## 优化内容（相对原版）

**安全**
- 密钥/配置外置，生产禁止硬编码；未配置 JWT_SECRET 时给出明确警告
- 安全响应头：CSP、X-Frame-Options、nosniff、Referrer-Policy、Permissions-Policy；关闭 X-Powered-By
- 认证接口限流（10 次/分钟/IP）+ 全局限流（300 次/分钟/IP），防爆破
- 输入校验：用户名长度、x/z 必须为整数、请求体大小限制（100kb）
- 首次部署 Owner 密码可配置或随机生成（不再默认 admin/admin123）
- Docker 非 root 运行、数据卷持久化

**性能**
- 瓦片视口懒加载：只渲染视野内瓦片，平移/缩放按需加载（地图网格与坐标不变）
- 静态资源缓存头：瓦片 7 天、vendor 1 年、页面 5 分钟
- Leaflet 本地化 + CDN 自动回退：部署机执行 `npm run fetch-vendor` 后完全脱离 unpkg

**工程化**
- 分层路由（config / db / middleware / routes）
- 请求日志、`/api/health` 健康检查
- 备份脚本 `npm run backup`（保留 7 份）
- 回归冒烟测试 `npm run smoke`（32 项断言，覆盖全部 API 与权限分支）
- Docker + PM2 双部署形态

## 回归测试

当前测试说明与已知覆盖缺口见 [TESTING.md](TESTING.md)。下方历史部署说明中的“32 项 / 49 张瓦片 / 默认 Owner / 两端逐字节一致”等描述不代表当前测试或 Worker 认证行为。Worker 当前使用邮箱验证登录。

```bash
npm ci
npm test           # 隔离测试，无需先启动服务
npm run test:coverage # HTML / LCOV 覆盖率报告
npm run smoke      # Express 子集，使用临时数据
```

## 备份

```bash
npm run backup     # 复制 mcmap.db 到 backups/，保留最近 7 份
# Linux cron 每日 3 点：0 3 * * * cd /path/to/app && /usr/bin/node scripts/backup.js
```

## 🚀 云端部署（Cloudflare Tunnel，免费 HTTPS / CDN / DDoS 防护）

> 为什么不用 Cloudflare Workers/Pages？本项目依赖 `sqlite3` 原生模块与本地文件系统，
> 无法运行在 Workers 无服务器沙箱中。正确姿势：应用跑在一台小 VPS（Docker），
> 通过 Cloudflare Tunnel 出站接入 CF 边缘。

### 步骤

1. **准备 VPS**（阿里云/腾讯云轻量/DigitalOcean 均可，1C1G 足够）+ 一个已托管到 Cloudflare 的域名。

2. **获取隧道凭据**（在 VPS 或本地均可）：
   ```bash
   cloudflared tunnel login                 # 浏览器授权，生成 cert.pem
   cloudflared tunnel create mcmap          # 创建隧道，输出 <TUNNEL_ID>
   cloudflared tunnel list                  # 查看 TUNNEL_ID
   ```
   将生成的 `<TUNNEL_ID>.json` 放入项目 `./cloudflared/` 目录。

3. **配置**：
   ```bash
   cp .env.example .env
   # 编辑 .env：JWT_SECRET（openssl rand -base64 48）、ADMIN_PASSWORD、TUNNEL_ID
   cp cloudflared/config.example.yml cloudflared/config.yml
   # 编辑 config.yml：把 <TUNNEL_ID> 替换为实际值，hostname 换成你的域名
   mkdir -p data/tiles && cp tiles/*.png data/tiles/   # 放置地图瓦片
   ```

4. **启动**：
   ```bash
   docker compose up -d --build
   docker compose ps        # 两个容器健康即成功
   ```

5. **DNS**：Cloudflare 面板 → DNS → 添加记录：
   ```
   类型 CNAME，名称 map，目标 <TUNNEL_ID>.cfargotunnel.com，代理状态开启（橙色云朵）
   ```
   访问 `https://map.example.com` 即自动 HTTPS。

6. **更新地图**：直接替换 `./data/tiles/` 下的瓦片文件即可，无需重建镜像（`docker compose restart app` 可立即生效，或等缓存自然过期）。

### 进阶：瓦片放 Cloudflare R2（免费 10GB，边缘缓存）

瓦片是纯静态文件，可放到 R2 由 CF 边缘直接缓存，减少 VPS 带宽：
- 在 CF 面板创建 R2 bucket，上传 `tiles/` 内容（可用 rclone：`rclone sync tiles r2:mc-map-tiles`）
- **方案 A（代码零改动）**：在 VPS 上用 rclone/s3fs 把 R2 bucket 挂载为本地目录，再把 `TILES_DIR` 指向它。前端 `/api/tiles` 与 `/tiles/*` 逻辑完全不变。
- 方案 B（改动小）：为 R2 bucket 绑定自定义域，把 `config.js` 中瓦片 URL 前缀改为 R2 域名。不推荐，会改变原版"目录扫描"方式。

## ☁️ 完全无服务器：Cloudflare Workers + D1 + R2（零 VPS）

> 如果你完全不想有服务器，可以用本仓库的 `worker/` 目录：**后端已重写为 Cloudflare Workers 运行时（零 npm 依赖）**，
> 前端（public/）由 Workers 静态资产承载，数据库用 Cloudflare D1（SQLite 方言，表结构不变），瓦片放 R2（URL 与文件名解析不变）。
> API 路径、响应、错误消息、权限逻辑与原版逐字节一致（本地 32 项回归全部通过）。

### 架构

| 原版 | Serverless 版 | 说明 |
|---|---|---|
| express 路由 | `worker/app.js` 手写 fetch 路由 | 12 端点 + health + /tiles，语义不变 |
| sqlite3 | Cloudflare D1 | 表结构 SQL 原样迁移 |
| bcryptjs | PBKDF2（新）+ 内联 bcryptjs（旧） | 现有 $2a$ 密码可直接登录；新密码为 pbkdf2 格式 |
| jsonwebtoken | Web Crypto HS256 手写 | 签名/验证等价 |
| 本地 tiles 目录 | Cloudflare R2 | list 代替 readdir，正则不变 |
| public/ 静态 | Workers Assets | 前端零改动 |

### 部署步骤

```bash
# 0) 安装 wrangler 并登录（部署机需外网）
npm i -g wrangler          # 或 npx wrangler
wrangler login

# 1) 创建数据库，并把输出的 database_id 填入 worker/wrangler.toml
wrangler d1 create mc-map-db

# 2) 建表 + 迁移现有数据（表结构与数据完全保留）
cd worker
wrangler d1 execute mc-map-db --remote --file=schema.sql
cd ..
node scripts/export-d1-sql.js > migrate.sql
wrangler d1 execute mc-map-db --remote --file=migrate.sql

# 3) 创建 R2 桶并同步瓦片（rclone 需配置 S3 兼容端点，见 R2 面板）
wrangler r2 bucket create mc-map-tiles
rclone sync tiles r2:mc-map-tiles

# 4) 设置密钥
wrangler secret put JWT_SECRET        # 输入 openssl rand -base64 48 的结果

# 5) 构建网站整合版（web/）并部署
#    worker/wrangler.toml 的 [assets] 已指向 ../web/dist（本仓库默认承载"网站整合版"）
npm run site:build          # 或：cd web && npm ci && npm run build
cd worker && wrangler deploy
```

> 部署的是「网站整合版」：地图首页 + 服务器介绍 + 历程记录 + 特别鸣谢 + 账号入口，
> 详细介绍见 [web/README.md](web/README.md)。回退旧版纯地图页：把 `worker/wrangler.toml`
> 中 `[assets].directory` 改回 `../public` 后重新部署即可（上游地图单页仍在 `public/index.html`）。

部署后默认域名 `mc-map-server.<子域>.workers.dev`。**注意：workers.dev 域名在国内被墙**，
建议到 Cloudflare 面板为 Worker 绑定自定义域名（Workers → 你的 Worker → Settings → Domains & Routes → Add Custom Domain）。

### 本地回归测试（无需 Cloudflare 账号）

```bash
cd worker
node test-local.js        # 隔离 Worker 测试：内存 SQLite、模拟邮件与存储
```

### 注意事项

- **免费层 CPU 限制（10ms/请求）与旧 bcrypt 密码**：现有用户的 $2a$ 密码验证需约 60ms CPU，
  在免费层可能超时。部署后请让用户登录后重新设置一次密码（转为 PBKDF2 格式），或使用 Workers Paid 计划（30s CPU）。
- 限流为单 isolate 内存实现：多副本并发时按副本近似限流（小站可接受；如需严格全局限流可改为 D1 计数）。
- 新部署（空 D1）时自动创建 Owner 账号：可用 `ADMIN_PASSWORD` secret 指定初始密码，否则随机生成并打印在日志。

## 🚀 自动部署：VS Code + Git + GitHub Actions（push 即上线）

整体链路：**VS Code 本地开发 → `git push` 到 GitHub → GitHub Actions 自动 `wrangler deploy` 到 Cloudflare**。
仓库已内置两个 workflow（`.github/workflows/`），无需手写 CI。

### 1. VS Code 本地开发

```bash
# 打开项目文件夹后，在 VS Code 终端：
npm start                    # 本地跑 Express 版（http://localhost:3000）
cd worker && node test-local.js   # 跑 Serverless 版 32 项回归（无需 Cloudflare 账号）
```

### 2. 推送到 GitHub

```bash
# 在 GitHub 新建一个仓库（如 mc-map-server，公开/私有均可），然后：
git init
git add .
git commit -m "mc-map-server with Cloudflare Workers serverless build"
git branch -M main
git remote add origin https://github.com/<你的用户名>/mc-map-server.git
git push -u origin main
```
> `mcmap.db`（含密码哈希）已被 `.gitignore` 排除，不会进 Git；现有数据通过部署时导入 D1。

### 3. Cloudflare 一次性准备（在你自己的电脑上执行一次）

```bash
npm i -g wrangler
wrangler login
```

然后到 Cloudflare 面板创建两个凭据：

| 凭据 | 位置 | 所需权限 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens → Create | Workers Scripts: Edit、Workers D1: Edit、Workers R2: Edit、Account Settings: Read |
| R2 API Access Key | R2 → Manage R2 API Tokens → Create | 对象读写（`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`） |

最后执行初始化脚本（自动创建 D1/R2、建表、导入数据、设置 JWT_SECRET）：

```bash
# Windows PowerShell：  powershell -ExecutionPolicy Bypass -File scripts/cf-init.ps1
# Linux/macOS：         bash scripts/cf-init.sh
```

### 4. 配置 GitHub Secrets

GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 上面的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 面板首页右下角的 Account ID |
| `R2_ACCESS_KEY_ID` | R2 API Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API Access Key Secret |
| `JWT_SECRET` | `openssl rand -base64 48`（与 cf-init 设置的保持一致） |

### 5. 自动部署与检查规则

| 推送内容 | 触发动作 |
|---|---|
| `worker/**`、`web/**` 或 `public/**` | `deploy.yml`：构建 `web/dist` → 自动创建 D1（首次）→ 建表 → `wrangler deploy` → 写入 JWT_SECRET |
| `tiles/**` | `sync-tiles.yml`：rclone 同步瓦片到 R2，保留 `/_uploads/**` 手机上传层 |
| `android_native/**` 或原生构建工作流 | `android-native.yml`：构建调试 APK、单元测试、Lint，上传 APK 与报告 |
| 任意 push / pull request | `test.yml`：Node.js 22/24 后端测试、覆盖率与 Flutter 测试 |

Worker 与瓦片部署仅响应 `main` 上对应路径的 push；原生客户端变更生成 APK，不会安装到用户设备。检查工作流与部署工作流目前独立运行，部署不会自动等待测试。部署、瓦片同步和原生构建也可以在 GitHub Actions 页面手动触发（workflow_dispatch）。

### 6. 访问

部署后访问 Worker 域名（`wrangler deploy` 输出 `mc-map-server.<子域>.workers.dev`）。
**workers.dev 域名在国内被墙**：到 Cloudflare 面板 Workers → 你的 Worker → Settings → Domains & Routes → Add Custom Domain，绑定你的域名（走 CF 代理自动 HTTPS）。

## 安全清单（上线前核对）

- [ ] `.env` 已设置强 `JWT_SECRET` 且不提交版本库
- [ ] 首次登录后立即修改 Owner 密码（或部署时指定 `ADMIN_PASSWORD`）
- [ ] 只开放 22/80/443 端口；应用端口仅监听 127.0.0.1（compose 已默认）
- [ ] 开启 Cloudflare 免费 WAF / Bot Fight Mode
- [ ] 每日备份（`npm run backup` + cron）
- [ ] 定期 `npm audit`（部署机有外网时）

## 已知边界

- 瓦片按文件名解析坐标，zoom 前缀不参与渲染（与原版一致）；当前 49 张瓦片为若干条带，非完整矩形区域
- 前端瓦片为"按需加载单张大图"，放大超过 1 倍仍会拉伸模糊（与原版一致，若要真切片需引入新渲染管线，属于地图结构变更，不在本次范围内）
