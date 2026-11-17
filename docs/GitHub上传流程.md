# 简记 · GitHub 仓库

本仓库即项目的实时同步仓库：**每完成一个文件/模块即提交并推送一次**。

- 仓库地址：https://github.com/YU06118/jianji
- 主分支：`main`
- 同步方式：本地 `git add <文件> && git commit && git push`

## 提交约定
| 前缀 | 含义 |
|---|---|
| feat(x) | 新功能（x = shared/desktop/miniprogram/prototypes/docs） |
| fix(x) | 缺陷修复 |
| test(x) | 测试与自检 |
| docs(x) | 文档 |

## exe 安装包
Git 不适合放二进制，构建完成后通过 GitHub Release 附件上传：
1. 仓库页面 → Releases → Draft a new release
2. Tag 填 `v0.1.0`
3. Attach binaries：拖入 `desktop/src-tauri/target/release/bundle/` 下的 `.msi` / `.exe`

## 不入库内容（见 .gitignore）
- `desktop/node_modules/`、`desktop/src-tauri/target/`、`desktop/src-tauri/gen/`
- 系统临时文件
