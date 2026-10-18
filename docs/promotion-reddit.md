# StoneSVN Reddit 投稿

2026-10-18 检查：用户已完成 Reddit 登录。r/tauri 投稿已发布，页面与社区信息流均显示该帖。r/SideProject 提交受到 Reddit 频率限制，页面提示等待 18 分钟后重试；已在 Reddit 保存草稿，按钮显示“更新草稿”，尚未发布。公开安装包最新为 v1.1.2。

已发布：[r/tauri 展示帖](https://www.reddit.com/r/tauri/comments/1x94lxp/stonesvn_an_opensource_svn_desktop_client_built/)。

## 渠道筛选

| 社区 | 适合介绍的内容 | 当前结论 |
| --- | --- | --- |
| r/tauri | Rust 调用 SVN CLI、桌面分发和工作台实现 | 已发布，详情页与社区信息流已核对 |
| r/SideProject | 产品使用场景和试用反馈 | Reddit 草稿已保存；提交提示需等待 18 分钟，尚未发布 |
| r/coolgithubprojects | MIT 开源仓库及功能介绍 | 后续候选，先核对提交页和账号条件 |
| r/svn | SVN 工作流和客户端能力 | 受众精准但发帖不活跃，先核对是否限制投稿 |
| r/opensource | 开源项目介绍 | 本次跳过，规则禁止 AI 生成内容 |
| r/software | 免费开源 SVN 客户端及明确的使用场景 | 新候选；规则允许开源软件自荐，但有账号 karma 门槛，待 SideProject 发布后单独评估 |
| r/macapps | macOS SVN 工作副本工具 | 条件候选；要求社区内 karma、推广资格和模板；不满足主帖资格时仅评估月度推广串 |

## SideProject 自动跟进

用户已于 2026-10-18 要求限制解除后继续发布。已创建当前聊天的跟进任务 stonesvn-sideproject，约 20 分钟后检查草稿并重试。任务要求先查重复帖、遵守 Reddit 限制、核对公开链接并更新记录；成功后停用。该任务仅负责 SideProject，不会自动向其他版块批量投放。

先在最相关的社区发布一篇，确认帖子状态后再考虑第二个社区。若被移除或要求账号资历，不重复提交，也不通过其他账号规避限制。

## r/tauri

标题：StoneSVN: an open-source SVN desktop client built with Tauri 2, Rust and Vue 3

正文：

Sharing StoneSVN, an MIT-licensed desktop SVN client developed from OrcaSVN. It runs on Windows, macOS and Linux and focuses on reviewing changes, choosing a commit scope and keeping unfinished modifications in local shelves.

For other Tauri developers, the interesting part is the boundary between the UI and an existing native tool. The Vue 3 frontend calls Rust through Tauri commands; Rust runs the user's installed SVN CLI. The process layer uses Tokio timeouts, piped output and `kill_on_drop`, and sets the child process locale on Unix so SVN output stays UTF-8 when launched from the desktop.

The app includes multiple working copies in a project sidebar, text diffs, file/directory selection for commits, local shelving of selected text hunks, commit history, global ignore rules and five interface languages.

- English overview and screenshots: https://stonesvn.github.io/en/
- Source: https://github.com/firzen/StoneSVN
- Installers: https://github.com/firzen/StoneSVN/releases/latest

The current release is v1.1.2. SVN CLI needs to be installed separately. macOS packages are ad-hoc signed and not notarized. General Merge, Switch and line-by-line Blame interfaces are not available.

Feedback on installation and the working-copy review flow would be useful, especially from developers using SVN across different operating systems. Self-submission; this introduction was prepared with AI assistance.

## r/SideProject

标题：StoneSVN - An open-source SVN desktop client for Windows, macOS and Linux

正文：

For developers whose projects still use Subversion, StoneSVN puts working-copy switching, diff review and selective commits in one desktop workspace.

It is MIT-licensed and developed from OrcaSVN using Tauri 2, Rust and Vue 3. You can open an existing SVN working copy, review changed files, choose the files or directories for a commit, and keep unfinished text changes in local shelves, including selected hunks.

It also includes commit/file history, image previews, SVN property editing, global ignore rules, five interface languages and light/dark themes.

- Screenshots and introduction: https://stonesvn.github.io/en/
- Source and downloads: https://github.com/firzen/StoneSVN

Current release: v1.1.2, with installers for Windows, Linux, and Apple Silicon/Intel Macs. A separate SVN CLI installation is required; Mac builds are ad-hoc signed and not notarized. General Merge, Switch and line-by-line Blame interfaces are not available.

If you still use SVN, which part of your current client's review-and-commit workflow feels most awkward? Feedback on project switching and commit selection would help shape the next improvements.

Self-submission; the introduction was prepared with AI assistance.

## 核对依据

- [r/SideProject 社区介绍和提交格式](https://old.reddit.com/r/SideProject/)
- [r/tauri 规则](https://www.reddit.com/r/tauri/about/rules.json)
- [r/SideProject 规则](https://www.reddit.com/r/SideProject/about/rules.json)
- [r/opensource 规则](https://www.reddit.com/r/opensource/about/rules.json)
- [r/coolgithubprojects 规则](https://www.reddit.com/r/coolgithubprojects/about/rules.json)
- [r/software 规则](https://www.reddit.com/r/software/about/rules.json)
- [r/macapps 规则](https://www.reddit.com/r/macapps/about/rules.json)

公开规则未列出额外条目不等于账号满足发布资格；以登录后的提交页、版规和审核结果为准。

## SideProject 提交回执（2026-10-18 22:52）

18 分钟冷却限制已解除，原草稿提交获得链接：https://www.reddit.com/r/SideProject/comments/1x953u1/stonesvn_an_opensource_svn_desktop_client_for/ 。

登录态信息流显示帖子；但未登录公开页面显示“Sorry, this post was removed by Reddit’s filters.”，因此不计为成功公开曝光。自动重试任务 stonesvn-sideproject 已暂停，避免重复提交。不绕过过滤，不换账号或删帖重发。
