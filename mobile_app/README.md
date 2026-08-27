# MC Server Map 移动端 App（Flutter）

移动端原生 App，与网页端（Cloudflare Workers + D1/R2）共用同一套后端 API。
独立分支构建，与网页端 main 完全分离。

## 功能

- **底部导航栏**：`服务器 | Wiki | [地图·居中凸起] | 标记 | 我的`，对称分布、固定在底部不被覆盖、选中项主绿胶囊填色（微信/QQ 风格）
- **主题**：MC 官网（minecraft.net）配色明暗两套，跟随系统自动切换
- **地图页**：仅地图+标点；首次进入/刷新后居中 (0,0)；左上角刷新+世界切换；右上角半透明登录状态；右下角坐标显示、长按复制；登录用户长按标点弹出屏幕中央大悬浮卡片（只读，✕ 关闭）；瓦片本地缓存+每次查看增量检查更新
- **标记页**：顶部 ☰ 菜单键控制「类型/标记」栏目（黄金分割 38.2%/61.8%，可收拉）；按名称首字母（中文拼音）排序；类型含 全部/收藏/全部网页端分类；收藏各账号独立最多 20；卡片点击进入只读详情页（与网页端内容相同）
- **Wiki 页**：接入 MC百科 mcmod.cn，可搜索；登录用户点 📸 将当前页地址记入收藏（未登录无反应）；浏览历史记录退出时的最后页面地址
- **我的页**：邮箱+密码登录（缓存 7 天免验证）；昵称/角色/邮箱展示不可修改；收藏与历史记录（新到旧、最多 50 条、长按复制、点击跳 Wiki、< 返回）
- **服务器页**：MC Server List Ping 协议（与 QQ 群机器人苦力怕娘同途径）监控在线人数/玩家/延迟，每 1 分钟系统自动刷新（用户不可手动）；卡片化；右上角 + 添加域名（最多 5 个）；📌 置顶且多个置顶可拖动排序；成功=绿色泛光恒常 / 新添加未获取=红色泛光闪烁 / 连续失败 3 次=冻结样式+失败持续时间 / 恢复成功解除；长按卡片上浮+其余界面模糊 → 菜单（收藏·修改域名·删除）；单击下沉无功能
- **Android 返回手势**：默认系统返回导航（次级页面返回上级，地图页退出）

## 环境要求

- Flutter SDK >= 3.16（Dart >= 3.0）
- Android SDK（构建 APK 用）；如需 iOS 需 macOS + Xcode

## 构建步骤（Windows / Android）

```bash
cd mobile_app

# 1. 生成 Android/iOS 平台目录（pubspec.yaml 已存在，不会被覆盖）
flutter create . --platforms=android,ios --org dev.mcmap

# 2. 给 Android 加网络权限：编辑 android/app/src/main/AndroidManifest.xml，
#    在 <manifest> 标签内（<application> 之前）加入：
#     <uses-permission android:name="android.permission.INTERNET"/>

# 3. 拉取依赖
flutter pub get

# 4. 构建 APK
flutter build apk --release
#    产物：build/app/outputs/flutter-apk/app-release.apk
#    安装到手机：adb install build/app/outputs/flutter-apk/app-release.apk
```

> 如需真机调试：`flutter run`（需开启 USB 调试）。

## 配置

- **API 域名**：`lib/api_client.dart` 顶部 `base` 常量，默认 `https://worldeternal.xyz`，与你的 Cloudflare 部署域名一致；不一致时改这里
- **Wiki 站**：`lib/pages/wiki_page.dart` 默认 mcmod.cn；搜索 URL `https://www.mcmod.cn/s?key=关键词`（如站点搜索路径有变可在此调整）
- **MC 服务器**：添加时填 `域名` 或 `域名:端口`（默认 25565）；服务器需开放 25565 查询端口（与网页/机器人监控同一要求）

## 目录结构

```
lib/
  main.dart                入口 + 底部导航壳（IndexedStack 保活 + 切页联动）
  theme.dart               MC 官网明暗两套主题
  models.dart              数据模型（标记/瓦片索引/服务器/记录）
  api_client.dart          Workers API（瓦片索引/标记/登录）
  mc_ping.dart             MC Server List Ping 协议（状态/在线/延迟）
  stores.dart              本地存储（登录7天/收藏/历史/服务器/瓦片缓存）+ 全局状态
  widgets/bottom_nav.dart  底部导航（地图居中凸起）
  pages/
    map_page.dart          地图页（自绘瓦片 + 缓存 + 增量更新 + 标点交互）
    markers_page.dart      标记页（类型/标记黄金分割 + 拼音排序 + 收藏）
    marker_detail_page.dart 标记详情（只读）
    wiki_page.dart         Wiki 页（mcmod.cn WebView）
    profile_page.dart      我的页（登录 + 收藏/历史）
    servers_page.dart      服务器监控页
```

## 性能优化

- 瓦片并发下载上限 3、内存 LRU 缓存上限 240 张、本地磁盘缓存
- 地图视野裁剪：只渲染/加载视野内瓦片
- IndexedStack 页面保活，切页不重建不丢状态
- 服务器轮询仅前台运行（后台暂停 Timer）
- 列表全部懒加载（ListView.builder）