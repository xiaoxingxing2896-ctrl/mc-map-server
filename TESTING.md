# 测试与覆盖范围

## 本地执行

使用 Node.js 22.12+ 或 24，安装锁定依赖后执行：

```sh
npm ci
npm test
npm run test:coverage
```

覆盖率输出到 `coverage/index.html`、`coverage/lcov.info` 和 `coverage/coverage-summary.json`。
门槛为行/语句 90%、函数 90%、分支 85%，不达标时退出码非零。
`npm run smoke` 只运行 Express 集成测试；`npm run test:worker` 或
`node worker/test-local.js` 运行 Worker 测试。无需启动服务、真实数据库、固定瓦片数量、Cloudflare 账号或邮件凭据。

## 测试设计

- Express 使用随机本地端口、内存 SQLite、临时瓦片目录和测试专用凭据。
- Worker 使用真实内存 SQLite，经现有 SQLite 适配器运行路由 SQL。
- 两套后端共用权限/标注 API 行为契约，各自单独测试认证流程，避免继续假设用户名登录与邮箱登录等价。
- 邮件和 Turnstile 的 fetch 请求完全模拟；R2 分页、D1 绑定单独做接口契约测试。
- 限流用虚拟时钟检查窗口与 IP 隔离；备份和导出只操作临时文件。
- `server.js` 直接运行时仍启动服务，导入时只导出 app/main，供测试控制监听与清理。

## 移动端

```sh
cd mobile_app
flutter pub get
flutter test --coverage
```

替换失效的 `MyApp` 计数器测试，增加真实导航组件、模型序列化、登录过期、收藏容量与账号隔离、历史去重、维度缓存和状态通知测试。
SharedPreferences 使用内存模拟。导航组件测试不启动完整 App，不访问 WebView、远程地图或 Minecraft 服务器。

## 统计口径与限制

c8 的 `all: true` 把未加载的选定源码计为零覆盖。统计包括 config/server、src、worker 顶层业务源码和三个维护脚本。
第三方 vendor、测试辅助代码、部署 shell 脚本、网页内联 JavaScript 和 Dart 不计入这份后端百分比。
Dart 使用 Flutter 单独的 LCOV 报告，不能与 Node 百分比直接混用。

本地 Node 测试不是 workerd 集成测试：真实 D1/R2、CPU 限制、Workers Assets 路由及线上反向代理仍需环境测试。
网页地图拖动/缩放、标注面板、浏览器缓存与多账号切换尚无浏览器端到端测试。
Flutter SDK 不在本次本地环境中，新增移动端测试尚未在本地运行；CI 的 Flutter job 负责验证。
CI 的 Tests workflow 在 push/PR 运行并上传覆盖报告。它未接入已有部署 workflow 的依赖关系，因此部署不会自动等待这些测试；合并保护需仓库设置另行配置。

## 回归修复

新测试在原业务代码上复现了 8 个失败（4 个问题 × 2 套后端）：

1. 私有标注详情可被匿名或其他账号直接读取。现与列表相同，仅公开标注或创建者可读取，否则 404。
2. admin 可把普通用户提升为 owner。现拒绝该操作，owner 仍可管理他人角色。
3. 空白、布尔值和数组被转换成整数坐标。现只接收非空数字字符串或数字，且要求安全整数。
4. 部分更新仅提交标题也会重置分类和公开状态。现保留省略字段，显式 false/0 仍生效。

## 仍需后续专项测试/修复

以下为代码审查发现的具体风险，本次未声称已解决：

- 两套后端信任 JWT 内的角色/用户名，降权或改名后的旧 token 不会立即失效；标注以用户名关联，改名后的归属也需要迁移策略。
- Worker 验证码使用 Math.random；`forgot` 与 `email/code` 的邮箱冷却策略不一致。并发验证码消费、并发首用户 owner 分配尚无竞争测试。
- Worker 缺少与 Express 等价的请求体上限，初始化失败/限流的早返回未附安全头；JWT_SECRET 缺省回退为固定开发密钥。
- Flutter MarkerCache 以 world 而非账号作为键，需验证登出或切换账号后私有标注缓存不会泄露；AuthStore 登录时间缺失及邮箱清理边界也需要补充。
- Express 首启失败、旧 admin 升级 owner、部分 SQL 异常，以及实际浏览器和移动端网络错误流程仍有未覆盖分支。

适配器测试参考：[D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)、
[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)。
