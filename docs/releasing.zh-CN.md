# 正式发布

[English](releasing.md) | 简体中文

正式版本使用 `vX.Y.Z`。不要手动打正式标签，不要移动已公开的标签。预发布仍使用[预发布流程](prerelease.zh-CN.md)，不会同步到正式官网。

## 准备一次发布

1. 完成代码和用户文档，在 `docs/releases/vX.Y.Z.md` 编写 GitHub Release 的完整说明。
2. 在 `docs/releases/vX.Y.Z.website.json` 编写官网摘要，结构参照 `v1.1.2.website.json`。必须包含 `en`、`zh-CN`、`zh-TW`、`ja`、`ko`，每种语言提供 `title` 和非空 `items` 数组。流水线同步已审核文案，不依赖机器翻译服务。
3. 运行 `npm run release:prepare -- X.Y.Z`，统一 npm、Tauri、Cargo 和锁文件的六处版本值。此命令要求版本递增，且更新说明已齐全；空白 Markdown 会在修改任何版本值前被拒绝。随后运行 `npm run release:check`，只读校验六处版本、完整说明和五种语言摘要。
4. 审阅、提交并推送到 `main`。版本文件或更新说明变更会触发 **Stable Release**。若推送使用的令牌不触发 Actions，在 Actions 页面手动运行，或运行：

```bash
gh workflow run tauri-build.yml --repo firzen/StoneSVN --ref main
```

不需要创建标签、上传安装包或手动更新官网。

## Codex 下次发版与完成验收

[AGENTS.md](../AGENTS.md) 是代码代理的长期入口。下次发版先读取它，不依赖历史聊天或临时目录。仅要求维护文档、完善流程时，不自动增加版本或发布新版本。

在应用仓库根目录执行：

```bash
npm run release:check
candidate=$(git rev-parse HEAD)
gh run list --repo firzen/StoneSVN --workflow tauri-build.yml --commit "$candidate" --json databaseId,displayTitle,status,conclusion,url
```

若目标未发布版本已经准备好，直接运行 `release:check`，不要对当前版本重复运行 `release:prepare`。先查看相同提交是否已有发版任务，避免重复启动。新任务标题用 `Release stable` 和 `Validate stable` 区分正式入口与演练。推送后没有对应正式任务时，显式 dispatch；选定任务后等待完成：

```bash
gh run watch RUN_ID --repo firzen/StoneSVN --exit-status
```

一次发版请求必须满足以下条件才能汇报完成：

- 四个桌面检查与打包任务成功，publish 任务针对预期源码成功。演练成功、或已有正式版自动跳过，都不代表发布了新版本。
- 目标标签解析到已检查的候选提交；GitHub Latest 为目标标签，`draft: false`、`prerelease: false`，说明经过审阅，9 个分发文件齐全。核对实际文件名和链接，不只看数量。
- 官网 build 和 Pages deploy 均成功。用户要求立即更新主页时，显式启动 `sync-release.yml` 并等待，不把未来的定时同步当作已经完成。
- 官网 `source/release.json` 的标签、源码 SHA 与正式标签对应；五种语言的静态更新说明和版本元数据、15 张截图及主题切换、7 个主要下载链接均匹配实际版本。

只读验收命令：

```bash
gh api repos/firzen/StoneSVN/releases/latest --jq '{tag: .tag_name, draft, prerelease, assetCount: (.assets | length), url: .html_url}'
gh api repos/firzen/StoneSVN/commits/vX.Y.Z --jq .sha
gh api -H 'Accept: application/vnd.github.raw+json' repos/stonesvn/stonesvn.github.io/contents/source/release.json --jq '{tag, sourceSha}'
gh run list --repo stonesvn/stonesvn.github.io --workflow sync-release.yml --json databaseId,status,conclusion,url
```

原生构建运行期间持续告知进度；最终说明版本／Release 链接、各目标检查、官网结果及仍存在的失败。保留其他任务的草稿文件；官网只在独立仓库提交，应用目录下被忽略的 `website/` 是预览镜像。

## 自动流程和失败处理

流水线固定候选提交 SHA，校验版本及五种语言摘要。已公开的当前版本自动跳过，普通开发提交不会重复发布。

1. Ubuntu x64、Windows x64、macOS Apple Silicon 和 macOS Intel 分别运行 `npm run check`（前端构建、Node 回归、Rust 格式和测试），再构建安装包。macOS 还验证架构和 Ad-hoc 签名。
2. 收齐并核对 9 个产物：两种 Mac DMG 与 app 压缩包、Windows EXE/MSI、Linux AppImage/DEB/RPM。所有平台成功且 `main` 仍指向候选提交后，才创建指向该提交的标签。
3. 创建 Release 草稿，上传并核对每个附件的名称、大小和上传状态，再公开并设置 Latest。已公开版本不能覆盖；失败草稿只允许用相同源码重试。
4. 官网 **Sync Release and Deploy** 每 5 分钟检查一次 Latest，从发布标签的源码启动 Vite，以虚构文档数据生成五种语言的浅色工作区、深色工作区和属性页截图（共 15 张），不执行真实 SVN 操作。截图脚本和浏览器依赖也固定于发布标签；v1.1.2 使用固定提交的兼容脚本。同步五种语言摘要、发布时间、版本和源码 SHA，生成带更新说明及 SoftwareApplication 版本信息的静态页面，再推送官网仓库。截图 URL 带源码 SHA，避免缓存显示旧图。

跨平台检查或构建失败时，不创建标签和 Release。上传阶段失败时草稿不公开，可修复基础设施问题后重跑；若要改源码，重新准备候选版本。若检查期间 `main` 有新提交，发布门禁拒绝旧候选，请对最新 `main` 重新运行。

官网失败不撤回已公开版本；下次定时检查会自动重试，包括摘要已提交但 Pages 部署失败的情况。需要立即重试时，在官网仓库 Actions 单独运行 **Sync Release and Deploy**（使用 Latest），或执行：

```bash
gh workflow run sync-release.yml --repo stonesvn/stonesvn.github.io --ref main
```

官网只允许同步当前 Latest 正式版本，避免旧任务回写旧版本。官网推送采用普通快进，若页面维护提交同时发生，任务失败而不会覆盖维护内容，重新运行即可。

## 官网权限与部署

官网仓库禁用了 deploy keys，因此使用拉取式同步，不配置跨仓库密钥或个人令牌。官网自己的 `GITHUB_TOKEN` 只写官网内容，单独的部署作业只有 `pages: write` 与 `id-token: write`。应用仓库只有最终 publish 作业有 `contents: write`。

官网仓库 `.github/workflows/sync-release.yml` 每 5 分钟检查 GitHub Latest；GitHub 定时任务可能延迟。没有新版本且上次部署正常时，不安装依赖、不截图、不部署。官网连续 30 天无提交时仅创建一次空维护提交，保持定时同步启用，不修改页面。正式版更新后自动生成五种语言内容和截图，推送生成文件，再通过 `deploy-pages` 部署；不依赖机器人提交触发另一个工作流。官网需配置 Pages 的 build type 为 workflow。

需要立即同步时手动运行官网工作流。官网模板或样式推送到 `main` 时也会重新部署。并发维护导致推送冲突会中止任务，下一次运行重试，不强推。

## 检查流程自身

在 **Stable Release** 手动勾选 `validate_only`，或执行：

```bash
gh workflow run tauri-build.yml --repo firzen/StoneSVN --ref main -f validate_only=true
```

这会完整执行四个平台的检查和打包，保留 7 天构建产物，不创建标签、不发版、不修改官网。适合检查流水线改动。

Windows 固定使用 SlikSVN 1.14.5，并仅为临时 CI SVN 进程启用 UTF-8，保留多语言路径回归。SVN 不随安装包分发。macOS 使用 Ad-hoc 签名，未经过 Apple 公证。CI 的检查、打包及截图不能替代各平台安装启动与真实仓库操作的人工验收。

## 构建缓存与耗时

稳定版工作流按运行器平台使用独立的 Rust 缓存，并仅在作业成功后保存。测试依赖和 Tauri 打包所需的 release/custom-protocol 依赖（包括 macOS 显式目标目录）与普通 CI、预发布缓存分开保存。Rust 编译器、依赖与配置变化仍会影响缓存键。精确命中的缓存不可覆盖：如果后续工作流在依赖不变时调整构建目标或特性，应递增 `stable-release-v1` 缓存命名空间，重新生成完整缓存。新命名空间需要先成功运行一次冷缓存构建，再测量热缓存构建。

四个平台仍执行 `npm run check`。只有该步骤成功后，打包才使用 `src-tauri/tauri.ci.conf.json`，复用已经生成的 `dist` 前端产物，避免再次构建。正常本地 Tauri 构建仍保留前端构建钩子。继续优化时需保留 action 仅构建模式、重试、DMG 环境、架构与签名检查及九个资产的发布门禁。

对同一提交连续运行两次 `validate_only=true`，可以在不发版的情况下比较冷、热缓存性能。检查各步骤耗时和 Rust 的 `Finished` 日志；最慢的桌面作业决定发布耗时。官网同步是独立的构建与部署，应单独计时。

StoneSVN 的正式仓库为 `firzen/StoneSVN`，安装包通过 GitHub Releases 分发。应用标识仍为 `com.orcasvn.desktop`，保留原有本地数据兼容；不复用历史 WinGet 分发标识。
