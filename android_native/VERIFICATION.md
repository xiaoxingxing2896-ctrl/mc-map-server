# 构建与部署验证记录

## 2.2.0 — 2026-09-09

主题系统第一阶段：三套内置主题、统一组件、方块导航图标、按压/导航/页面/地图动效及系统设置优先的触感反馈。后端未改动。

- 最终本地 Gradle 编译、assembleDebug、testDebugUnitTest、lintDebug 全通过（27 秒），包含切页淡入状态重置修正。
- 单元测试 14 项通过：原有认证 6 项、领域 5 项、新增主题 3 项；主题测试包含三套主题的明暗模式和极端自定义强调色下的正文/按钮对比度。
- Lint 0 错误、14 个非阻断建议（依赖更新、Uri KTX 和 Modifier 工厂形式）。
- APK v2 调试签名验证通过；versionCode 3，minSdk 26，targetSdk 36。
- `artifacts/MC-Atlas-debug.apk`：19,636,752 字节，SHA-256 `3244895F48175FDFCE937F0B49B6C0FECE34809D73949065AE0DA35DEA9B7BAD`。
- USB 调试手机覆盖安装成功，启动返回 Status ok；所查 AndroidRuntime 错误日志为空。启动工具未报告冷启动耗时，不据此给出冷启动性能结论。
- 本轮屏幕采集为息屏画面，设备报告 Dozing；完整视觉、动画流畅度、真实振感及新设置跨进程恢复仍需真机交互确认。尚未执行线上上传写入。

此处记录本地构建结果；对应提交的云端状态见仓库 Native Android 工作流。

## 2.1.0 — 2026-09-09

本轮更新包含 Minecraft 默认外观与持久化自定义设置、中文 Minecraft Wiki 原站接入、标记页布局、游客查看公开标记，以及登录输入体验和会话并发处理。后端认证接口没有改动；本轮认证基础回归测试 19 项通过。

包含系统自动填充和响应式选项布局的最终源码已完成本地验证：

| 检查 | 结果 |
| --- | --- |
| 编译、Debug APK 构建、单元测试与 Lint | 全部通过，Gradle 最终一轮耗时 33 秒 |
| Kotlin 单元测试 | 11 项通过，0 失败（AuthState 6 项、Domain 5 项） |
| Android Lint | 0 错误、13 个非阻断警告（7 个依赖更新提示、6 个 UseKtx 建议） |
| 后端认证基础回归 | 19 项通过，后端源码未改动 |
| 包信息 | dev.mcmap.nativeapp / 2.1.0 / versionCode 2 / minSdk 26 / targetSdk 36 |
| APK 签名 | `apksigner verify` 通过，Android APK v2 调试签名 |
| 真机更新安装 | `adb install -r` 成功 |
| 真机启动 | 冷启动 1781 ms，所查 AndroidRuntime 错误日志为空 |
| 真机地图画面 | 已显示真实瓦片、绿色导航与地图控件；截图见 `artifacts/reports/device-2.1.png` |
| 登录页与外观设置 | 用户手动确认显示和操作正常 |
| 深色主题 | 已在标记页确认生效；截图见 `artifacts/reports/device-markers-dark-2.1.png` |
| 设置重启保留 | 终止进程后冷启动 1827 ms，深色与圆角设置恢复，未清除应用数据 |
| Wiki 原站加载 | 已加载中文 Minecraft Wiki 实际页面，原生工具栏保留深色主题；截图见 `artifacts/reports/device-restart-dark-2.1.png`，所查 AndroidRuntime 日志无崩溃 |

最终产物：`artifacts/MC-Atlas-debug.apk`，19,541,123 字节，调试版本。

SHA-256：`6F1881D28EA32A2D2867A623C2B291A65B614C3477843659C80137DE938E30A6`

本节为本地构建与设备验证记录，未将本轮尚未运行的 GitHub Actions 计为通过；对应提交的后续 CI 结果可查看 [Native Android 工作流](https://github.com/xiaoxingxing2896-ctrl/mc-map-server/actions/workflows/android-native.yml)。下方 2.0.0 的产物校验值仅用于历史对照。

登录页与外观设置已获用户手动确认显示和操作正常，深色主题在标记页生效，进程重启后保留深色与圆角设置，Wiki 原站内容已实际加载。系统拒绝 ADB 输入注入，因此未执行自动交互测试。Wiki 全量导航栈、收藏与手势、管理员线上上传及新瓦片显示仍未完整实测；本轮未向生产 R2 写入测试瓦片。

## 2.0.0 — 2026-09-08

原生客户端源码：`android_native/`。以下构建数据对应已发布到仓库的 `b7092ce` / 2.0.0 调试版本，在 NTFS 构建副本中使用 JDK 17 / SDK 36 / Gradle 9.3.1 完成验证。

| 检查 | 结果 |
| --- | --- |
| Debug APK 构建 | 通过 |
| Kotlin 单元测试 | 5 项通过，0 失败 |
| Android Lint | 0 错误、8 个非阻断警告（7 个依赖更新提示、1 个备份规则提示） |
| 后端测试 | 68 项通过，0 失败 |
| 后端行覆盖率 | 97.13% |
| 后端分支覆盖率 | 90.32% |
| 三维度真实仓库 PNG 样本 | 主世界、下界、末地各 1 张，格式与解压校验通过 |
| APK 签名 | Android APK v2 签名校验通过（调试签名） |
| 包信息 | dev.mcmap.nativeapp / 2.0.0 / minSdk 26 / targetSdk 36 |

该版本产物：`artifacts/MC-Atlas-debug.apk`，19,387,309 字节。此路径会随新构建更新，请按版本核对校验值。

SHA-256：`BDD3AE795604858B4416D43EDD3D84819051970581591EC4C1E513ABF83EF498`

报告位于 `artifacts/reports/`，包含 Kotlin JUnit XML、Lint HTML/文本和后端覆盖率日志；生成文件不提交 Git。

### GitHub Actions 与线上服务

提交 `b7092ce2095586e43d05a120cf528b510c70192d` 已推送到 `main`。

| 检查 | 结果 |
| --- | --- |
| [Native Android](https://github.com/xiaoxingxing2896-ctrl/mc-map-server/actions/runs/34188800275) | 成功，构建、单元测试、Lint 与产物上传均通过 |
| [Tests](https://github.com/xiaoxingxing2896-ctrl/mc-map-server/actions/runs/34188800258) | 成功，Node.js 22、Node.js 24 与 Flutter 测试均通过 |
| [Worker 部署](https://github.com/xiaoxingxing2896-ctrl/mc-map-server/actions/runs/34188800283) | 成功，已更新现有线上服务 |
| 线上 `/api/health` | HTTP 200，`ok: true` |
| 三维度瓦片索引 | HTTP 200，主世界 84、下界 190、末地 26 项；索引 `no-store`，图片 URL 含版本 |
| 三维度图片读取 | 各 1 张，HTTP 200，`image/png` |
| 无身份上传请求 | 无 Token 返回 401，无效 Token 返回 403 |

线上读取验证目标为 [mmap.worldeternal.xyz](https://mmap.worldeternal.xyz/)；瓦片数量为本次检查时的快照。

### 真机与验证边界

2.0.0 调试 APK 已在 USB 调试授权的手机上成功安装，冷启动耗时 2177 ms，所查 AndroidRuntime 日志没有崩溃。已读取地图和个人页画面。手机系统拒绝 ADB 输入注入（`INJECT_EVENTS`），因此未完成自动交互测试；页面截图和成功启动不代表真实账号登录或全部 UI 流程通过。

尚未使用真实管理员账号执行线上上传，生产 R2 没有本次测试写入；R2 条件写入使用模拟绑定测试，本地文件存储使用真实临时目录测试。真实账号登录、手势、WebView、深浅主题、管理员上传及更新后地图显示仍需继续验证。
