# 构建与部署验证记录

## 2.3.2 — 2026-09-09

修复地图缩放与标记定位：图片加载器由 ViewModel 持有，切页不再清空解码缓存；将 3 路并发限制放到图片网络调度，不再用拦截器将缓存命中排在网络请求后面。视口外增加 256 方块加载缓冲，中心附近瓦片优先。缩放 ≤0.25 时解码 256 像素，≤0.5 时解码 512 像素，其余为 1024；分辨率变化时使用同 URL 缓存占位并允许复用更清晰图片。总览单张新解码 ARGB 图片从约 4 MB 降至约 0.25 MB，此为像素内存估算，并非真机性能测量。瓦片以 Canvas 视口坐标绘制，缩放不再改变图片布局尺寸。

标记详情和坐标输入均立即定位、保留当前缩放，避免长距离跳转动画加载沿途瓦片或取消时停在中途。黄色准星标出真实目标，独立于附近标记聚合与显示开关；跨维度仅在目标维度展示。定位坐标同步更新，世界坐标使用 Double，定位针尖端与目标坐标对齐。

- 最终 `assembleDebug`、`testDebugUnitTest`、`lintDebug` 通过，构建耗时 29 秒。
- 33 项 JVM 单元测试通过，0 失败/错误；新增 5 项覆盖世界边界奇数坐标、不同缩放下精确居中、同时平移缩放的手指锚点、1,000 次缩放往返、相邻瓦片边缘与总览解码分档。
- Lint：0 错误、15 个警告、4 个提示。
- 调试 APK：`artifacts/MC-Atlas-debug.apk`，versionName 2.3.2 / versionCode 6，19,928,964 字节。
- SHA-256：`E7A6E5C4C8C4F23E937C1C29DD24E2EF05AA9D03458FC0307BBDEEBF1A4D9AB5`。

本轮未安装真机、未测量真实网络加载耗时，也未运行 Compose 手势自动化；以上通过项不代表手机上的卡顿与重加载已完成实测。首次进入、缓存被淘汰或瓦片 URL 版本变化仍需加载。

手机回归步骤：

1. 在瓦片密集区域连续双指缩放和点击 ± 各 20 次，尤其跨越 0.25/0.5 分档，检查图片占位、瓦片接缝、闪空与崩溃；平移离开后返回，并切换标记页再回来检查缓存复用。
2. 分别在缩小和放大状态，从标记详情点击「在地图中查看」，确认比例保持、坐标更新、黄色准星位于地图视口中心；检查密集聚合点、同坐标点、隐藏标记以及跨维度跳转。
3. 手输负坐标及 `X 29999999 / Z -29999999`，确认中心目标与坐标读数一致；世界边界没有瓦片时仍应显示准星。
4. 跳转后立即拖动、再次跳转、切页返回，确认没有旧动画拉回或重复应用旧跳转；开启减少动态/关闭动效后重复定位。

## 2.3.1 — 2026-09-09

地图标记与 Wiki 空间优化：白边彩色水滴定位针、原创像素分类图案、固定 22×30 dp；按 32 dp 屏幕距离聚合密集点，不随应用字号变大。支持聚合点点击放大、长按列表、同坐标点直接展开与隐藏标记。地图内容限制在地图视口内。

Wiki 移除多行原生标题、固定分类按钮和底部工具条，默认仅一行紧凑工具栏；搜索自动聚焦，分类/收藏/前进/首页/刷新/外部浏览器放在菜单。阅读模式隐藏原生工具栏与应用导航，右下角按钮退出，避让网站自己的搜索控件。保留 WebView 状态、HTTPS 约束与会话记录逻辑。

- 最终 assembleDebug、testDebugUnitTest、lintDebug、assembleDebugAndroidTest 通过（30 秒）。
- 28 项单元测试通过：原有 23 项 + 地图聚合 5 项，覆盖缩放拆分、同坐标可达、响应顺序稳定、负坐标、世界边界，以及 1000 个标记不遗漏且展示锚点不重叠。
- Lint 0 错误、15 个非阻断建议。APK v2 调试签名通过；versionName 2.3.1，versionCode 5。
- 手机覆盖安装成功，最终启动成功（本次冷启动 2030 ms）。实际地图已显示新水滴定位针；中文 Minecraft Wiki 原站正常加载，普通与阅读模式的正文区域均已实屏检查。
- 截图：`artifacts/reports/map-2.3.1.png`、`wiki-2.3.1.png`、`wiki-reading-2.3.1.png`。
- 最终 APK `artifacts/MC-Atlas-debug.apk`：19,926,329 字节，SHA-256 `FE7F3D7FAEC9F8DD750EC10359CDD7939EA1F1380F74B16197A1C8B63CB283F0`。

聚合点击/长按的完整触控流程、阅读模式内搜索/历史/收藏的完整交互回归仍待手动检查；本次实屏核对通过 debug-only 页面入口完成，不将截图当成交互测试通过。未改后端或生产地图数据。


## 2.3.0 — 2026-09-09

第二阶段：主题工作室、本地 ZIP 主题包、独立草稿与副本、素材与字体、预览/设计/素材分区、导入导出、删除、撤回切换和损坏回退。根据真机反馈，工作室改为 MC 游戏菜单：跟随当前主题配色，固定直角方块骨架、双层边框、石质按钮、方块背景；预览/设计/素材分区，编辑时收起底部导航。后端未改动。

- 最终 Gradle assembleDebug、testDebugUnitTest、lintDebug、assembleDebugAndroidTest 全通过。
- 23 项 JVM 单元测试通过：认证 6、领域 5、基础主题 3、主题包 9；包含发布示例包校验；纹理对比度按实际 alpha 合成检查正文与强调色文字。
- Lint 0 错误、16 个非阻断建议（依赖版本、Uri KTX 和 Modifier 工厂形式）。
- Android 真机存储测试 1 项通过（0.127 秒）：真实 Bitmap 解码、保存生成独立 ID、主题包往返、非法图片不污染主题库、限制删除范围及删除副本。使用独立临时目录，不改用户主题库。
- Compose UI 自动化宿主在此设备未正常进入测试页面，该尝试已停止，不计作通过。实际 MainActivity 可以正常冷启动；工作室实屏已检查，幽匿古城配色、主题景观卡片与导航正常显示。截图：`artifacts/reports/phase2-studio-final.png`。
- 最终 APK 已在 USB 设备覆盖安装并启动（最后一次启动未返回可用的冷启动耗时）；v2 调试签名验证通过，versionCode 4 / versionName 2.3.0。
- `artifacts/MC-Atlas-debug.apk`：19,849,650 字节，SHA-256 `4905C37EC0A1FC403FEC42181BE15FED6D9D45E0CEA6D35587943504AB1C7DE4`。
- 用户要求进一步强化 MC 游戏菜单风格，已完成上述修正；最后一次截图时设备息屏，用户选择先完成提交，稍后自行查看游戏菜单版本；最终实屏复核及保存/应用手动复测尚未完成。完整文件选择器往返、所有字体/图片格式组合、真实触感与长期稳定性不作为已完成的自动验证。

示例主题：`examples/Moss-Workbench.mcatlas-theme`；使用本项目生成的原创方块景观，可由同目录 PowerShell 脚本重新生成。主题编辑不连接后端，不写生产瓦片。


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
