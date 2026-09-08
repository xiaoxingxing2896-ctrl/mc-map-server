# MC Atlas — 原生 Android 客户端

MC 多功能地图应用的 Kotlin + Jetpack Compose 重构工程。继续使用现有地图网站的 Workers API、世界坐标与 1024×1024 瓦片。

旧 Flutter 工程位于 `../mobile_app`，保留用于功能对照和回退。原生包名 `dev.mcmap.nativeapp`，可与 Flutter 版本并存；旧版登录、收藏和服务器列表不会自动迁移，请在原生版重新登录和添加服务器。

## 已实现

- Material 3 深浅主题、安全区域适配、固定五页导航：服务器 / Wiki / 地图 / 标记 / 我的。
- 原生地图拖动、双指缩放、缩放按钮、坐标跳转与长按复制；三维度切换、刷新回原点、标记长按只读详情与收藏。切页保留地图视角。
- 视口裁剪、最多 3 个并发图片请求、按内存比例限制图片缓存、128 MB HTTP 磁盘缓存、公共瓦片索引离线回退。R2 图片版本进入 URL，替换后不复用旧缓存。
- 标记分类侧栏（38.2%）、中文排序、搜索、每账号最多 20 个收藏、跨维度定位。私有标记不落盘，退出登录或切换维度清空，过期请求不能覆盖新状态。
- Wiki 搜索、HTTPS WebView、网页返回栈、刷新、每账号独立收藏及历史（各 50 条、去重倒序、长按复制）。网页最后地址跨切页保留。
- 邮箱登录；Android Keystore AES-GCM 加密会话，DataStore 保存设置，7 天过期检查，不保存密码，禁止备份会话。
- Java 服务器真实 TCP Server List Ping、SRV 查询、Ping/Pong RTT、在线人数与样本玩家、最多 5 个服务器、前台每分钟轮询，连续 3 次失败显示离线持续时间。长按管理收藏/置顶/域名/删除，置顶顺序使用可访问的上移/下移按钮。
- 管理员/Owner 的个人页瓦片管理：系统文件选择、尺寸及大小检查、图片预览、目标维度与坐标检查、自动判断新增/替换、确认后上传、失败提示与重新检查、上传后刷新地图。

地图/Wiki/服务器目前没有原生音视频播放场景，因此本次没有加入闲置 Media3 播放器。Wiki 网页媒体仍由 WebView 处理；未来若增加服务器宣传片或独立媒体页，再接入 Media3 与播放器生命周期。

## 构建

JDK 17、Android SDK 36；Gradle 9.3.1、AGP 9.1.0、Kotlin/Compose compiler 2.4.0。依赖版本在 `app/build.gradle.kts` 固定，Compose UI 通过 BOM 对齐。

仓库 H: 盘此前有 Gradle 卡死记录，Windows 建议复制到 NTFS 盘构建。已提供仓库脚本：

```powershell
./scripts/build-android-native.ps1 -JavaHome 'E:/dev/jdk17' -AndroidSdk 'E:/dev/android-sdk' -BuildDir 'C:/build/mc-atlas'
```

脚本运行 APK 构建、Kotlin 单元测试和 Android Lint，成功后将 APK 复制到 `android_native/artifacts/MC-Atlas-debug.apk`。首次构建需要下载依赖。也可直接在 Android Studio 打开本目录；SDK 路径放在不提交的 `local.properties`。

```powershell
./gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

发布签名通过 `ANDROID_KEYSTORE_PATH`、`ANDROID_STORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 环境变量提供，再运行 `:app:assembleRelease`。不使用调试签名冒充正式发布包。

GitHub Actions 的 `Native Android` 工作流会对本目录变更运行相同检查并上传调试 APK 与报告。

## 管理员上传接口

**必须先部署包含本次修改的后端，旧线上接口不支持上传。** 本地修改不会自动更新线上 Worker；本次没有提交、推送或部署。

```http
PUT /api/tiles?world=overworld&name=x0_z0.png&mode=add
Authorization: Bearer <登录 token>
Content-Type: image/png

<PNG 二进制>
```

- world：`overworld` / `nether` / `end`。
- name：`x0_z0.png`、`x0z0.png`、`3_16_x0_z0.png` 等既有坐标命名。坐标范围 ±30,000,000。
- mode：`add` 或 `replace`。坐标已有瓦片时新增返回 409；替换不存在的坐标返回 404。
- 替换手机上传过的瓦片时，必须将当前瓦片索引的 `version` 放入 `If-Match`，版本过期返回 409。客户端刷新预览后才能再次确认。
- 每次读取数据库中的当前角色，普通用户、已删除用户、已被降权的旧管理员 token 均不能上传。
- 上限 8 MB；流式限量读取，校验 PNG 签名、IHDR 尺寸/格式、块边界/CRC、IEND、解压长度和扫描行过滤器。仅接受 1024×1024 PNG。
- 新增返回 201，替换返回 200，响应含坐标、世界、图片 URL 和版本。没有批量 ZIP 导入或整维度快照替换。

### 存储及同步

手机上传保存在 `_uploads/<world>/x<X>_z<Z>.png`，按坐标覆盖显示仓库的基础瓦片。基础文件仍保留；R2 通过条件写入保护并发替换，Express 使用文件锁与临时文件重命名。手机端只持有用户 Token，不持有 R2 凭据。

`GET /api/tiles` 合并基础层和上传层，每个坐标只返回一项，索引禁止缓存，上传图片 URL 带内容版本。仓库原有 R2 同步工作流已排除 `/_uploads/**`，防止 Git 同步误删手机上传内容。**同一坐标的手机上传层会持续优先显示，即使后来推送了新的基础瓦片。** 如需恢复基础层，需管理员在存储端移除对应上传层对象；当前 App 未提供删除上传层的入口。

### 验证边界

自动检查包含后端角色/降权、损坏文件、尺寸/大小/路径、同坐标冲突、跨维度隔离、实际文件读写、R2 条件写入契约，以及 Kotlin 登录过期、命名、地址解析、协议帧和文件限量读取。

R2 测试通过模拟对象存储检验 API 契约，不代表已做生产 R2 写入测试。调试 APK 尚需真机核验手势、WebView、深浅主题、管理员端到端上传和重新进入地图后的新瓦片显示。仅有 USB 连接不代表手机已授权调试。

参考：[Compose compiler 配置](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler)、[R2 条件写入](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)。
