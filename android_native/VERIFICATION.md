# 本地验证记录 — 2026-09-08

原生客户端源码：`android_native/`。在 NTFS 构建副本中使用 JDK 17 / SDK 36 / Gradle 9.3.1 完成验证。

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

产物：`artifacts/MC-Atlas-debug.apk`，19,387,309 字节。

SHA-256：`BDD3AE795604858B4416D43EDD3D84819051970581591EC4C1E513ABF83EF498`

报告位于 `artifacts/reports/`，包含 Kotlin JUnit XML、Lint HTML/文本和后端覆盖率日志；生成文件不提交 Git。

未完成环境验证：手机显示 USB 调试未授权，未安装/启动此 APK，未做真机 UI 或线上管理员账号上传测试。生产 Worker 尚未部署本次修改，R2 没有真实写入；R2 条件写入使用模拟绑定测试，本地文件存储使用真实临时目录测试。新建 GitHub Actions 配置尚未推送运行。
