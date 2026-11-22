# 简记 Jianji · 多端总导航

家庭记账工具「简记」的平台总入口。本仓库不存放业务代码，用于汇集四个平台仓库的文档与直达链接：**微信小程序（主端）、Windows、macOS、Android**。

- **数据理念**：所有端数据全部存本机，零网络请求、不上传、无需注册；唯一例外是热更新请求 GitHub Releases 并经 minisign 验签。
- **仓库沿革**：项目最初为单一 monorepo（`jianji`），2026-11-21 按平台拆分为四仓库；2026-11-22 原仓库名 `jianji` 让给本导航仓库，Android 端启用 `jianji-android`。旧 monorepo 完整保留在 [`jianji-android` 的 `archive/monorepo-20261122` 分支](https://github.com/YU06118/jianji-android/tree/archive/monorepo-20261122)。

## 平台总览（小程序为主端）

| 优先级 | 平台 | 仓库 | 状态 | 获取方式 |
|---|---|---|---|---|
| ★ 主端 | 微信小程序 | [jianji-miniprogram](https://github.com/YU06118/jianji-miniprogram) | 已完成，持续迭代 | 微信开发者工具导入；AppID `wx7e44ad0c1a857e87` |
| 2 | Windows 桌面端 | [jianji-windows](https://github.com/YU06118/jianji-windows) | 已完成 | [v0.1.8 安装包](https://github.com/YU06118/jianji-android/releases/latest)（随 jianji-android Releases 保留）；新发版将发布于 jianji-windows |
| 3 | macOS 桌面端 | [jianji-macos](https://github.com/YU06118/jianji-macos) | 已完成 | [v0.1.8 Release](https://github.com/YU06118/jianji-macos/releases/latest)：Intel（x64）+ Apple Silicon（aarch64）DMG |
| 4 | Android | [jianji-android](https://github.com/YU06118/jianji-android) | v0.1.0 · debug APK | [arm64 APK 下载](https://github.com/YU06118/jianji-android/releases/tag/android-v0.1.0)（允许安装未知来源）；构建说明见仓库 docs |

## 文档直达

全部文档按平台整理在 [docs/文档导航.md](docs/文档导航.md)，每条均为可点击直达的 GitHub 链接。

最常用三份：

- [小程序 · 安全与合规规范（提审前必读）](https://github.com/YU06118/jianji-miniprogram/blob/main/安全与合规规范.md)
- [Windows · 使用与部署说明](https://github.com/YU06118/jianji-windows/blob/main/docs/使用与部署说明.md)
- [macOS · README（安装 / 构建 / 未签名放行）](https://github.com/YU06118/jianji-macos/blob/main/README.md)

## 技术栈与数据口径

| 项 | 说明 |
|---|---|
| 桌面端技术栈 | Tauri v2 + SQLite + 原生 HTML/JS 前端（无打包器） |
| 小程序技术栈 | 微信原生小程序，零第三方依赖，代码包约 157KB |
| Android 技术栈 | Tauri v2 + WebView（纯 HTML/CSS/JS，无打包器），localStorage，CI 产出 arm64 debug APK |
| 共享逻辑 | `shared/`（桌面端仓库内）：数据契约与核心算法，26 项单测 |
| 数据存储 | 桌面端 SQLite（`jianji.db`）+ 小票图片目录；小程序按月分片 localStorage；Android 为 WebView localStorage |
| 热更新 | Windows：Releases + minisign + 可选腾讯 COS 镜像；macOS：Releases + minisign（双架构 `latest.json`） |
| 跨端迁移 | 桌面端 JSON 备份/导出互通；小程序走剪贴板备份；小票图片需手动复制 `images/` 目录 |
| 隐私 | 全端零网络请求（更新器除外），无账号体系 |

## 发版状态速查

| 端 | 最新版本 | 发布位置 |
|---|---|---|
| Windows | v0.1.8 | [jianji-android Releases](https://github.com/YU06118/jianji-android/releases)（历史包随原仓库保留） |
| macOS | v0.1.8 | [jianji-macos Releases](https://github.com/YU06118/jianji-macos/releases) |
| 小程序 | v1.0.0（未提审） | 微信平台（提审流程见小程序仓库 README） |
| Android | v0.1.0（debug） | [jianji-android Releases · android-v0.1.0](https://github.com/YU06118/jianji-android/releases/tag/android-v0.1.0) |

---

个人项目，作者 [YU06118](https://github.com/YU06118)。
