# StoneSVN 首轮推广材料

首轮面向仍在使用 SVN 的开发者，重点介绍多工作副本、审阅差异、选择提交和临时保存修改。先从中文开发者社区收集真实试用反馈，再扩展英文渠道。

## 当前发布状态

2026-10-18 再次核对：v1.1.2 已正式公开，Windows、macOS 与 Linux 安装包已上传。以下通用文案保留基础功能介绍；周刊投稿正文见 promotion-submission.md。发布前重新确认最新版本。

GitHub 简介与八个主题标签已更新，Issues 已开启。已向十二个渠道发布介绍、投稿或申请收录，链接见下表；社区展示帖已公开，周刊投稿和目录申请尚未确认被收录。本轮推广重点已转向国际开发者社区和英文软件目录。

- 官网：https://stonesvn.github.io/zh-CN/
- 源码：https://github.com/firzen/StoneSVN
- 下载：https://github.com/firzen/StoneSVN/releases/latest
- 反馈：https://github.com/firzen/StoneSVN/issues

## V2EX 首发帖

发布入口：https://www.v2ex.com/new/create

标题：分享一个开源 SVN 客户端 StoneSVN，支持 Mac、Windows 和 Linux

正文：

如果你的项目还在使用 SVN，又希望把查看变更、审阅 Diff 和选择提交放在一个工作台里，可以试试 StoneSVN。

这是一个基于 Tauri、Rust 和 Vue 3 的开源桌面客户端，采用 MIT 许可证，支持 Windows、macOS 和 Linux。项目基于 OrcaSVN 继续开发。

几个适合日常工作的功能：

- 多个 SVN 工作副本放在同一个项目栏里切换。
- 提交前查看文本差异，按文件或目录选择提交范围。
- 暂时不提交的修改可以保存在本地贮藏中，支持按文本变更块选择。
- 查看提交时间线和单文件历史，预览图片。
- 全局忽略规则可以统一过滤临时文件。
- 支持简繁中文、英文、日文和韩文，以及浅色和深色主题。

可以打开已有 SVN 工作副本，也可以从仓库地址检出。需要先安装本机 SVN 命令行工具；macOS 安装包尚未经过苹果公证，首次打开方式见官网。

当前还没有通用 Merge、Switch 和逐行 Blame 界面，这些操作需要配合命令行或其他客户端。

官网和界面预览：https://stonesvn.github.io/zh-CN/

安装包：https://github.com/firzen/StoneSVN/releases/latest

源码：https://github.com/firzen/StoneSVN

如果试用了，欢迎反馈系统版本、SVN 版本，以及哪个日常操作最不顺手：https://github.com/firzen/StoneSVN/issues

## 中文短文案

还在用 SVN 的朋友可以试试 StoneSVN：MIT 开源，支持 Mac、Windows 和 Linux。把多工作副本、Diff 审阅、按文件和目录选择提交、本地贮藏放进一个工作台，支持中文和深色主题。需要本机 SVN CLI。介绍与下载：https://stonesvn.github.io/zh-CN/

## 英文简介

StoneSVN is an open-source SVN desktop client for Windows, macOS and Linux, built with Tauri, Rust and Vue 3 and developed from OrcaSVN.

It brings working-copy switching, diff review, file and directory selection for commits, and local shelving into one workspace. Shelving supports selected text hunks. It also includes commit history, image previews, global ignore rules, five interface languages, and light and dark themes.

StoneSVN uses your locally installed SVN CLI. General Merge, Switch and line-by-line Blame interfaces are not available. macOS builds are ad-hoc signed and are not notarized.

Website: https://stonesvn.github.io/en/

Downloads: https://github.com/firzen/StoneSVN/releases/latest

Source and feedback: https://github.com/firzen/StoneSVN

## 发布顺序和效果记录

| 顺序 | 渠道 | 具体动作 | 状态 |
| --- | --- | --- | --- |
| 1 | GitHub 项目页 | 补充简介、SVN 相关标签与 Issues 反馈入口 | 已完成 |
| 2 | 科技爱好者周刊 | 通过 GitHub Issues 提交工具自荐 | [已投稿](https://github.com/ruanyf/weekly/issues/12518)，待编辑筛选 |
| 3 | HelloGitHub | 按官方模板填写类别、描述、亮点与使用方式 | [已投稿](https://github.com/521xueweihan/HelloGitHub/issues/4023)，待编辑筛选 |
| 4 | 潮流周刊 | 在指定的自荐讨论串介绍使用场景 | [已发布](https://github.com/tw93/Weekly/discussions/22#discussioncomment-19018504)，尚未确认周刊收录 |
| 5 | 二丫讲梵学习周刊 | 按开源推荐模板介绍多工作副本使用场景 | [已投稿](https://github.com/eryajf/learning-weekly/issues/158)，待编辑筛选 |
| 6 | Awesome Mac | 向 Version Control 分类提交收录建议 | [已提交建议](https://github.com/jaywcjlove/awesome-mac/issues/3601)，尚未加入目录 |
| 7 | Tauri 官方社区 | 在 Show and tell 分类发布英文介绍，说明 Rust 调用 SVN 的实现 | [已发布](https://github.com/orgs/tauri-apps/discussions/16322) |
| 8 | Vue 官方社区 | 在 Show and tell 分类介绍 Vue 3 桌面工作台与多项目状态 | [已发布](https://github.com/orgs/vuejs/discussions/15915) |
| 9 | Awesome VCS Tools | 向 SVN Clients 分类提交单行英文目录条目 | [PR 已提交](https://github.com/postpdm/awesome-vcs-tools/pull/4)，待维护者审核 |
| 10 | Awesome Tauri Apps | 向 Developer Tools 分类按字母顺序添加目录条目 | [PR 已提交](https://github.com/chrysler-stone/awesome-tauri-apps/pull/27)，待维护者审核 |
| 11 | Reddit r/tauri | 介绍 Tauri 2、Rust 调用 SVN CLI 与工作副本审阅 | [已发布](https://www.reddit.com/r/tauri/comments/1x94lxp/stonesvn_an_opensource_svn_desktop_client_built/)，详情页及社区信息流均已核对 |
| 12 | Reddit r/SideProject | 按项目名加短说明的格式分享使用场景 | 冷却限制解除后[已提交原帖](https://www.reddit.com/r/SideProject/comments/1x953u1/)，公开核对显示被 Reddit filters 移除，未获得公开曝光 |
| 13 | Element Plus 社区 | 在 Show and tell 分类用英文介绍桌面应用中的菜单和对话框使用 | [已发布](https://github.com/element-plus/element-plus/discussions/24993) |
| 14 | Open Source macOS Apps | 按目录规范提交应用 JSON、图标、截图与英文官网 | [PR 已提交](https://github.com/serhii-londar/open-source-mac-os-apps/pull/1676)，待维护者审核 |
| 15 | Share your Work | 在允许分叉项目的英文展示分类介绍 SVN 审阅与提交工作流 | [已发布](https://github.com/MrrHat/Share-your-Work/discussions/8) |
| 16 | OSSDrop | 在 Developer Tools & CLI 类别新增一个 JSON 目录条目 | [PR 已提交](https://github.com/OSSDrop/OSSDrop/pull/87)，待维护者审核 |
| 17 | TiloBox | 提交官方仓库、英文官网、公开图标和客观用途 | 页面显示 Submission received，待人工审核，尚无公开条目链接 |
| 18 | V2EX 分享创造 | 使用上面的首发帖，围绕实际 SVN 使用问题交流 | 因账号缺少邀请码，暂缓 |

首帖发出后记录链接和时间，24 小时及 7 天后比较新增下载、有效问题和试用反馈。先解决安装失败、SVN 路径配置等影响试用的问题，再发第二篇围绕具体使用场景的介绍。下载次数按安装包统计，不等同于独立用户数。

2026-10-18 本轮提交正文分别保存在 promotion-hellogithub.md、promotion-tw93.md、promotion-learning-weekly.md 和 promotion-awesome-mac.md。提交前检索了相应仓库的 StoneSVN 记录；潮流周刊指定讨论串的现有评论中也未查到重复介绍。学习周刊模板指定的标签在目标仓库不存在，因此未附加该标签，正文仍按模板填写。

2026-10-18 国际渠道新增 Tauri 与 Vue 官方社区展示帖，正文分别保存在 promotion-tauri-community.md、promotion-vue-community.md。两个目录 PR 都只改动 README 的一行，提交前已核对贡献规范、重复记录、位置和公开安装包。创建的个人 fork 为 firzen/awesome-vcs-tools 与 firzen/awesome-tauri-apps，分支均为 codex/add-stonesvn。

国际渠道筛选：官方 awesome-tauri 当前只收录工具、插件和资源，不向其中投稿桌面应用；Awesome-Linux-Software 已归档，跳过。DEV 要求实质技术内容，不适合直接投放短广告。Hacker News 禁止生成文本和自动发帖，交由本人撰写和发布。后续可以在有相应账号时评估 Reddit 的 Tauri、开源软件及 SideProject 社区，先核对各版最新规则。

Reddit 本轮已完成登录和规则核对。r/tauri 已发布一篇英文展示帖；r/SideProject 提交遭遇 18 分钟的站点频率限制，保留草稿。未换账号或改用其他入口重复提交。r/opensource 明确禁止 AI 生成内容，本次跳过。正文与规则来源见 promotion-reddit.md。

用户要求延后继续后，已创建当前聊天的 SideProject 跟进任务 stonesvn-sideproject，间隔 20 分钟检查一次；发布成功即停用，状态不变时保持安静。SideProject 尚未因创建跟进任务而发布。

本轮新增 Element Plus 英文展示帖与 Open Source macOS Apps 收录 PR。展示帖正文见 promotion-element-plus.md；目录条目见 promotion-macos-catalog.json。目录 PR 只修改 applications.json，JSON 已解析验证，既有条目不变。新建个人 fork firzen/open-source-mac-os-apps，分支 codex/add-stonesvn。0PandaDEV/awesome-windows 的 AGENTS.md 明确禁止 AI 辅助贡献，因此未向其提交。

## 后续国外渠道筛选

| 渠道 | 核对结果 | 后续动作 |
| --- | --- | --- |
| Reddit r/software | 规则允许开源软件自荐，有账号 karma 门槛 | SideProject 发布后评估一篇独立的使用场景介绍 |
| Reddit r/macapps | 要求社区内 karma；主帖需满足推广资格并使用模板，否则限制在月度串 | 先核对账号资格和当前月度串，不直接发主帖 |
| Rust 用户论坛 announcements | 分类明确接收项目公告，需遵守论坛规范及登录条件 | 适合介绍 Rust 进程管理和 SVN 工作流，尚未发布 |
| DEV | AI 辅助文章规则禁止推广程序 | 不投放本次宣传稿 |
| This Week in Rust | 已停止接收 Project/Tooling Updates 的 PR；不接收 LLM 撰写文章 | 不提交本次项目更新或生成文章 |
| Awesome Rust | 要求至少 50 stars、2000 crates.io 下载或相当的指标 | 当前项目 0 stars、GitHub 安装包合计 12 次下载，不满足，暂缓 |
| Awesome Vue | AI 辅助项目需至少三次更新且首末发布间隔至少一个月 | 暂缓，后续按真实发布历史重新评估 |
| Lobsters | 邀请制；限制新用户的 show/announce 标签，并限制自荐占比 | 不作为新账号冷启动投放渠道 |

本轮新增筛选尚未产生新的公开帖子。依据：[r/software 规则](https://www.reddit.com/r/software/about/rules.json)、[r/macapps 规则](https://www.reddit.com/r/macapps/about/rules.json)、[Rust 论坛分类](https://users.rust-lang.org/categories)、[DEV AI 文稿规则](https://dev.to/guidelines-for-ai-assisted-articles-on-dev/)、[This Week in Rust 投稿说明](https://github.com/rust-lang/this-week-in-rust/blob/main/README.md)、[Awesome Rust 收录门槛](https://github.com/rust-unofficial/awesome-rust/blob/main/CONTRIBUTING.md)、[Awesome Vue 投稿要求](https://github.com/vuejs/awesome-vue/blob/master/.github/contributing.md)、[Lobsters 规则](https://lobste.rs/about)。上述项目指标为 2026-10-18 当次核对值。

建议下一篇主题：在 SVN 中临时保存一部分文本修改，再回来继续处理。用虚构仓库演示“查看差异 → 选择变更块 → 贮藏 → 恢复”的完整过程。

## 发布素材和渠道依据

- [v1.0.3 功能说明](https://github.com/firzen/StoneSVN/blob/v1.0.3/README.md)：首发功能文案依据。
- [官网界面预览](https://stonesvn.github.io/zh-CN/)：浅色、深色工作台及属性页。当前官网展示开发界面，配图时注明，避免让读者误以为与 v1.0.3 安装包完全一致。
- [V2EX 分享创造](https://www.v2ex.com/go/create)：节点欢迎分享自己的作品，适合作为中文首发候选。
- [Hacker News 规则](https://news.ycombinator.com/newsguidelines.html)：要求由本人撰写内容，并禁止自动发帖和生成文本；上面的英文稿不用于 HN。若选择 Show HN，需要本人撰写并参与讨论，参考 [Show HN 指南](https://news.ycombinator.com/showhn.html)。

当前项目是 OrcaSVN 的 fork；对外介绍保留来源，不使用“从零原创”或未经验证的速度、资源占用比较。

## 2026-10-18 22:50 新增国际渠道

Share your Work 展示帖已通过 GraphQL 创建并获得公开链接；正文见 promotion-share-your-work.md。OSSDrop 明确欢迎作者提交，仅修改 data/tools.json，增加一个 15 行的条目，验证了 JSON、描述长度和既有条目保持一致；素材见 promotion-ossdrop.json。个人 fork 为 firzen/OSSDrop，分支 codex/add-stonesvn。TiloBox 表单使用公开项目资料，未填写可选联系邮箱，页面返回 Submission received；仍需人工审核，不计为正式收录。

SideProject 22:46 再次提交仍提示等待 4 分钟；未发布，保留原草稿与现有自动跟进。

| 新核对的渠道 | 入口及结果 | 状态 |
| --- | --- | --- |
| r/coolgithubprojects | https://www.reddit.com/r/coolgithubprojects/；公开社区，现有 Tauri/Rust 客户端展示帖，专属规则列表为空 | 可作为后续候选，发帖仍需通过站点限制 |
| r/foss | https://www.reddit.com/r/foss/about/；明确要求推广对象必须是自由开源软件 | 项目 MIT 符合对象要求，待发帖条件检查 |
| r/svn | https://www.reddit.com/r/svn/about/；直接相关、公开，但活动量低 | 候选，优先级低于活跃社区 |
| Made with Tauri | https://madewithtauri.com/submit；需联系邮箱，人工审核 | 尚未提交 |
| AlternativeTo | https://alternativeto.net/faq/；需要账号、支持添加新应用 | 尚未登录或提交 |
| Alternative.me | https://alternative.me/how-to/submit-software/；需要邮箱注册账号 | 尚未注册或提交 |
| Console.dev | https://console.dev/selection-criteria；通过邮箱推荐开发者工具 | 可准备投稿，尚未发送邮件 |
| Pointer | https://www.pointer.io/about/；邮件投稿，以文章为主 | 适合技术文章，尚未投稿 |
| FOSSRadar | https://www.fossradar.dev/submit；要求印度创始人、核心贡献、组织或当地社区影响之一 | 当前无资格证据，跳过 |
| GitHub Release Radar | github/release-radar 及其转移目标 mishmanners/github-release-radar 均已归档 | 跳过，不向失效渠道提交 |
| OpenSourceAlternative.to | https://www.opensourcealternative.to/submit；要求 self-hosted；免费排队 6+ 个月，快速审核收费 | 当前桌面客户端不适合该投稿条件，未提交 |

### SideProject 最终核对（2026-10-18 22:52）

22:51 原草稿提交成功，作者登录态在社区信息流可看到标题及正文。随后用未登录公开页面核对，发现明确提示“Sorry, this post was removed by Reddit’s filters.”。因此状态记为已提交、被自动过滤，而非公开发布成功。原帖：https://www.reddit.com/r/SideProject/comments/1x953u1/stonesvn_an_opensource_svn_desktop_client_for/ 。已将 stonesvn-sideproject 自动任务设为 PAUSED，避免重复提交；不更换账号、不删帖重发、不通过其他接口规避过滤。后续如需复核，可由本人向社区版主提供原帖链接。

另核对 AppImageHub：目录要求应用在最旧的受支持 Ubuntu LTS 上无需安装额外软件包即可运行。StoneSVN 依赖外部 SVN CLI，当前未验证满足该要求，因此暂不提交 AppImageHub。

## SEO / GEO and overseas submissions - 2026-10-18

New submissions, awaiting maintainer review:

- DevShelf: https://github.com/RitualDev-Lab/DevShelf/issues/91 . Official project template, objective developer workflow description, MIT license and external SVN requirement. Body saved in promotion-devshelf.md.
- Lists Open Source: https://github.com/Sofyan232/lists-opensource/issues/25 . The official submission form confirmed this repository and the runtime-tooling category. Includes upstream attribution and current limitations.
- DevHunt: https://devhunt.org/login requires GitHub or Google sign-in. Its development contribution guide does not currently establish a PR listing workflow despite the older repository description. Not submitted.
- ToolShelf: https://toolshelf.dev/submit exists, but the public page only exposed Loading. Submission requirements not confirmed; not submitted.

### Website work completed locally, not deployed

The existing website already provides static language pages, canonical URLs, reciprocal hreflang, robots.txt, sitemap.xml, sharing previews and SoftwareApplication data. The wildcard Allow rule already allows search crawling. No need to change training preferences for search visibility.

Added three substantive English pages, linked from the English homepage and included in the eight-URL sitemap:

| Search intent | Page | Content |
| --- | --- | --- |
| open source SVN client macOS | /en/guides/svn-client-macos/ | Installation, chip selection, existing working copies, external SVN, feature limits and upstream |
| SVN global ignore logs | /en/guides/svn-global-ignore/ | Workflow, examples, wildcards, and distinction from SVN properties |
| SVN stash selected hunks | /en/guides/svn-stash-selected-hunks/ | Saving and restoring partial text edits, unversioned files, patches and local storage limits |

Sources: website/source/guides.mjs and build-guides.mjs, integrated with website/build.mjs. Each generated page has one H1, independent title/description/canonical, static readable content, Open Graph and matching TechArticle data. Checked against v1.1.2; future feature changes require content review. Existing website validation passed; also parsed JSON-LD and sitemap, checked local links and canonical URLs for all three guides. No website commit or deployment was performed.

### Implementation order

1. Publish the checked guide files through the website repository. Verify ownership in Google Search Console, submit sitemap.xml and inspect the homepage and three guide URLs. Do the equivalent in Bing Webmaster Tools. Account access and ownership verification are not yet confirmed.
2. Target real questions with English tutorials, examples, screenshots and honest limitations. Proposed phrases above are relevant topics, not claims of measured keyword volume or difficulty.
3. Share the appropriate guide in relevant communities, using a consistent product name, official website and source link. A submitted directory entry is not yet a listing or a guaranteed ranking signal. Avoid unrelated directory farms and duplicate posts.
4. For GEO, make direct answers, product facts, version context and sources easy to read and cite. Existing robots.txt does not block OAI-SearchBot. Search crawling and GPTBot training controls are independent; no training preference was changed.
5. Do not treat llms.txt or special AI markup as a prerequisite. Google states that AI Overviews and AI Mode use the same SEO foundations and require no special schema or AI text files. Never fabricate reviews, ratings or third-party endorsements.
6. Review non-brand impressions, clicks and indexed pages weekly in Search Console. Compare referral visits and download changes, without counting release asset requests as unique users or attributing every download to one post. No analytics tracking was installed without a concrete measurement setup.

Public searches for site:stonesvn.github.io StoneSVN and the brand plus SVN client returned no results this run. This does not establish Google indexing status; use Search Console URL Inspection to verify.

Primary references: https://developers.google.com/search/docs/appearance/ai-features and https://developers.openai.com/api/docs/bots . Technical eligibility does not guarantee crawling, indexing, ranking or AI recommendations.

## Deployment and search setup - 2026-10-18 23:12

The three English guides are now deployed from stonesvn/stonesvn.github.io. Commit 8621de7 added the guide sources, generation, homepage links and sitemap entries. Deployment run 39138890629 completed successfully. HTTP GET checks returned 200 for all three guides, English homepage, robots.txt and sitemap.xml; guide canonical URLs and homepage links matched, with eight sitemap URLs.

Google Search Console site ownership was verified using the existing signed-in account and an HTML meta tag generated by Google. The sitemap submission displayed the success confirmation. This proves submission, not indexing. Google and Bing verification tags were added to the source template to survive future rebuilds. The website's concurrent release metadata change 4fbf18c was preserved by rebasing rather than overwriting or force-pushing.

New public community showcase: https://github.com/vuejs/pinia/discussions/3199 (Show and tell). Technical content covers the actual workspace and stash stores, session-only commit drafts, persisted recent paths, and cached-status state. Source and practical guide links included; verified the created discussion. Body: promotion-pinia.md.

Further screening: AI Kendra requires an AI-related, non-fork project and at least 10 stars, so StoneSVN does not qualify. Open Source Startups and OpenListing require a contact email; no private email was submitted. Existing OSSDrop PR 87, DevShelf issue 91 and Lists Open Source issue 25 remain open; no duplicate submissions made.

Search setup follow-up: Bing accepted the site after HTML meta verification and its sitemap table shows https://stonesvn.github.io/sitemap.xml as Submitted / Processing. Google URL Inspection showed the new macOS and global-ignore guide URLs were not yet known/indexed; both indexing requests subsequently displayed the confirmation that the URL was added to the priority crawl queue. These confirmations are not claims of completed indexing. User authorized firzen.pan@gmail.com for subsequent directory contact fields in this chat.

OpenListing attempt after user supplied the contact email: filled the official Developer Tools submission form with public source, website, neutral tagline and accurate limits. Submit returned `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` instead of a success receipt. Outcome is unconfirmed, so no duplicate retry was made and it is not counted as a successful submission.

## Directory submissions with authorized contact - 2026-10-18 23:19

Open Source Startups: https://www.opensourcestartups.com/submit displayed `Submission received!` and `Thanks - we'll review your project shortly. You'll see it on the directory once it's approved.` Submitted as Developer Tools, with the user's explicitly supplied contact email, the public handle firzen, official source/homepage, neutral description, upstream attribution, external SVN requirement and feature limitations. Awaiting review; no public listing URL yet. Newsletter signup popups were dismissed, not submitted.

OpenListing returned a JSON parsing error after form submission and is not counted as received or listed. No duplicate retries. Pinia discussion 3199 is the new confirmed public showcase in this run.

Website deployment verification tags: Google commit a4c1b99, Bing commit 555dc60. Both deployment runs completed successfully and the live homepage contains both tags. Bing site dashboard is accessible and sitemap shows Submitted / Processing. Google sitemap displayed submission success. The first two guide indexing requests displayed priority crawl queue confirmations; the third request is being processed. Newly published guide URLs were not yet indexed when inspected.

Final confirmation: the third guide (svn-stash-selected-hunks) also displayed Google's `Indexing requested` success and priority crawl queue notice. All three guide URLs now have confirmed requests, once each. Google and Bing sitemap submissions are complete. This is not a claim that the pages are indexed or cited by AI systems yet.

Live guides:
- https://stonesvn.github.io/en/guides/svn-client-macos/
- https://stonesvn.github.io/en/guides/svn-global-ignore/
- https://stonesvn.github.io/en/guides/svn-stash-selected-hunks/


## Index audit and new overseas submissions - 2026-10-18 23:33 CST

### New submissions

- Made with Tauri: https://madewithtauri.com/submitted showed `Successfully submitted` and manual review notice. Official submission form, authorized contact email, homepage and GitHub. Final description fits the 200-character limit and mentions MIT, external SVN CLI and OrcaSVN origin. Awaiting manual review; no public project page yet.
- Made with Vue.js: https://madewithvuejs.com/submit showed `Thanks for submitting your project!` after submission. Included the actual Vue 3, TypeScript, Pinia, Element Plus, Tauri 2 and Rust architecture. Authorized contact email; no newsletter subscription. Form states review takes about 6-8 weeks.
- LibHunt: current official form is https://www.libhunt.com/repo/submit (the old /site/submit_project path is not a submission form). Submission was automatically approved. Public page verified at https://www.libhunt.com/r/StoneSVN with source, official homepage and user guide links, SVN/version-control topics, external CLI requirement and upstream attribution. No account or email needed. An additional metadata correction was suggested because the short license label `MIT` rendered an incorrect OSI status; requested normalization to `MIT License`, with the source LICENSE URL.

### Search indexing observed in webmaster dashboards

- Bing homepage https://stonesvn.github.io/: `Indexed successfully; URL can appear on Bing`.
- Bing sitemap: `Success`, last crawl 18 Oct 2026, all 8 URLs discovered.
- Bing three guides: each `Discovered but not crawled`. Each indexing request was submitted once this run and displayed `Indexing requested.` This is not completed indexing.
- Google English homepage /en/ and selected-hunk guide still showed not indexed / URL unknown. The three guide requests from the previous run remain requests, not completed indexing. A request for the English homepage was started this run; final outcome recorded below.
- Public search results alone were not used to infer Google or Bing indexing.

### Prior submission audit

- DevShelf issue 91 now has `has-pr` label and a bot-created PR: https://github.com/RitualDev-Lab/DevShelf/pull/92 . Open, unmerged, with three successful CodeQL checks. This is review progress, not a published listing.
- VCS catalog PR 4, Tauri catalog PR 27, macOS catalog PR 1676 and OSSDrop PR 87 remain open/unmerged, no review comments. Lists Open Source issue 25 and Awesome Mac issue 3601 remain open without replies.
- Open Source Startups and TiloBox: no new public StoneSVN listing was found in this check; the known state remains submitted/awaiting review, not confirmed rejected. OpenListing submission remains unconfirmed due to its earlier JSON error; no duplicate sent.
- SideProject public page still explicitly says removed by Reddit filters: https://www.reddit.com/r/SideProject/comments/1x953u1/stonesvn_an_opensource_svn_desktop_client_for/ . No repost. Existing r/tauri post remains publicly readable.

### SEO / GEO follow-up deployed

Website commit d391509 adds a visible project byline and review date to all three English guides, matching TechArticle author, publication/modification dates, canonical mainEntityOfPage and preview image metadata. Open Graph and Twitter cards now have a preview image. Dates remain tied to the editorial review, not build time. Existing FAQ, crawler access and factual feature limits preserved.

Deployment run 39140804022 completed successfully (build and deploy). Live HTTP checks returned 200 for all three guides and confirmed the new author metadata and Twitter card. Existing static-site validation and all four release fallback tests passed. No claim of AI citations or ranking improvement is made from these metadata changes.

Additional screened channels: RepoRanker requires GitHub sign-in; no new account created. Softmola accepts software by email, which was not sent in this run. Haproven focuses on joining its project collaboration ecosystem and is a weaker fit than the technology showcases.

Final confirmations: Google English homepage indexing request displayed `已请求编入索引` and the priority crawl queue message. This is a request receipt, not indexed status. LibHunt's license-name correction displayed `Your suggested changes will be applied as soon as they are approved`; the project listing itself is public, while that metadata fix remains under review.


## Further overseas promotion and Linux guide - 2026-10-18 23:46 CST

- Vite Show and tell: https://github.com/vitejs/vite/discussions/23825 . Created and read back through GitHub to verify publication. Technical introduction covers the actual Vite/Tauri dev-server contract (1420/strictPort), conditional HMR host/1421, excluding Rust from the frontend watcher, type checking, manual chunks, and the native command boundary. No performance superiority claims. Body saved in promotion-vite.md.
- Awesome Linux Apps: https://github.com/cuongtk8/awesome-linux-apps/pull/75 . Submitted one alphabetical Version Control entry following CONTRIBUTING.md, including external SVN CLI requirement and the directory's open-source marker. Confirmed current v1.1.2 Linux AppImage/DEB/RPM assets. Awaiting review. PR attached to this chat.
- open-source.store: https://open-source.store/submit displayed `Submission Received!` and a moderator review notice naming StoneSVN. Category Developer Tools. Required GitHub URL, project name and concise description provided; no account or contact email required. Source origin and external SVN requirement included. Awaiting approval; no public listing URL yet.
- ToolShelf's live form is working but requires sign-in/sign-up; no new account created. Freshcode's form has express bot routing and license acceptance conditions; no submission made. FOSSpace requires an account; not submitted.

Published fourth English guide: https://stonesvn.github.io/en/guides/svn-client-linux/ . Covers x86_64 AppImage/DEB/RPM selection, separate Subversion CLI installation (Apache package documentation linked), connecting an existing working copy, executable-discovery troubleshooting, local stash workflow, current feature limits and upstream attribution. It does not claim manual installation acceptance on every Linux distribution.

Website commit cec092f. Deploy run 39141788021 passed both build and deploy. Live HTTP checks confirmed status 200, canonical URL, author/article content, homepage link and nine sitemap URLs. Existing static-site validator passed (five pages/15 screenshots) and four release fallback tests passed; parsed all four guide schemas, checked single H1, canonical URLs and internal file paths. The ignored app-checkout preview source was synchronized separately.

Latest audit: all five catalog PRs checked (VCS 4, Tauri 27, macOS 1676, OSSDrop 87, DevShelf bot PR 92) remain open/unmerged without new status changes. Google /en/ still reports not indexed and the existing request receipt; no duplicate request sent. New Linux guide indexing result is recorded below.

Ongoing follow-up: automation `stonesvn`, active every 12 hours in this chat. It checks submitted PRs, public directory listings, LibHunt license correction, community replies, and Google/Bing homepage/four-guide indexing. Notify only on verified approval, merge, public listing, newly indexed page, explicit rejection or necessary user action; unchanged/pending states stay quiet. It must not repost, repeatedly request indexing, buy placement, create accounts or send emails. Existing Reddit SideProject retry automation remains paused.

Bing Linux-guide inspection initially showed `Not discovered`; the first request then displayed `Indexing requested.` New guide is not yet indexed. Bing AI Performance baseline (Microsoft Copilots and Partners) reports 0 citations and 0 average cited pages for 18 July-17 October 2026, with no grounding-query data. That reporting window ends before today's promotion, so it does not measure this campaign's results and is not a claim about all AI systems.

Google's first Linux-guide request also displayed the priority crawl queue success confirmation. Both Google and Bing accepted the new guide request once. Actual indexing remains pending. Follow-up automation also monitors Bing AI citation data with report-date/latency caveats.


## Tokio, Vue I18n and Windows setup guide - 2026-10-18 23:56 CST

Confirmed public community posts:

- Tokio Show and tell: https://github.com/tokio-rs/tokio/discussions/8660 . Created and read back through GitHub. Describes the actual direct CLI argument invocation, piped stdout/stderr collection, timeouts, kill_on_drop, Unix locale and Windows console handling. Explicitly distinguishes buffered output from streaming or a memory-bounded pipeline and direct-child cleanup from full descendant-process-tree supervision. Links source tests without claiming a new benchmark or installation test. Draft: promotion-tokio.md.
- Vue I18n Show and tell: https://github.com/intlify/vue-i18n/discussions/2736 . Created and read back through GitHub. Covers five shipped locale files, composition mode, English fallback, supported stored-language validation, navigator language preference and the separate Element Plus locale map. Does not claim complete BCP 47 matching. Draft: promotion-vue-i18n.md.

Both are self-submissions with AI assistance disclosed, official source/website links, upstream attribution and external SVN requirement. Neither is an endorsement by the framework maintainers.

Screened but not submitted:

- AppLauncher requires a registered domain and rejects free-hosting subdomains. The current GitHub Pages subdomain does not satisfy that bar; no form submission.
- Enlisted requires at least 200 GitHub stars for open-source listings and an account for submission. Not eligible at present; no submission.
- THEHUB / Qutaifan has an explicit Tool Suggestion / Recommendation form and open-source submission guidelines. After filling accurate project details and the authorized contact address, Send Message displayed that the email application should open with a pre-filled draft. It did not provide a delivery/receipt confirmation. No email was sent, and this is NOT counted as a received submission. Do not blindly repeat it.

SEO/GEO content: published https://stonesvn.github.io/en/guides/svn-client-windows/ . Explains the v1.1.2 x64 EXE/MSI assets, the separately installed SVN CLI, official package sources, optional TortoiseSVN CLI tools, svn --version / where.exe svn checks, Settings executable selection, existing working-copy setup, troubleshooting and limits. Sources: https://subversion.apache.org/packages.html#windows , https://sliksvn.com/download/ , and the official release assets. No claim of manual installation acceptance on every Windows configuration.

Website commit 5f3ecc3, deploy run 39142460214: build and deploy succeeded. Live checks returned 200 for the new guide, verified its canonical/article body, the English homepage link and all 10 sitemap URLs. The site now has five English guides. Static-site validator passed (five locale pages, 15 screenshots), four release-fallback tests passed, and all five guide JSON-LD/H1/canonical/internal paths were checked. Ignored local preview source/generated pages synchronized.

All six catalog PRs checked this run (VCS 4, Tauri 27, macOS 1676, OSSDrop 87, DevShelf 92 and Linux Apps 75) remain open/unmerged with zero PR comments. No new approval claimed.

Automation stonesvn now discovers all English guide URLs from the site's sitemap instead of hard-coding four articles; the same 12-hour cadence and notify-only-on-meaningful-change policy remain. New Windows guide indexing receipts are recorded below.

Final receipts: Google displayed `已请求编入索引` and priority crawl queue confirmation for the Windows guide; Bing displayed `Indexing requested.` after the first submission. Before requesting, both reported the new URL unknown/not discovered. Requests were made once per engine; actual indexing remains pending.


## Ten-minute overseas promotion session - 2026-10-18 23:57 to 2026-10-19 CST

- Open Source Builders: https://github.com/junaid33/opensource.builders/issues/591 . Submitted a standalone-tool request after reading CONTRIBUTING_TO_OSB.md and checking existing submissions. Open issue receipt confirmed; pending maintainers, not a published directory listing. Accurate MIT/upstream/platform/CLI requirements and AI assistance disclosure included. Draft: promotion-opensource-builders.md.
- Startup Collections: https://startupcollections.com/submit-product/ . Its linked Google Form displayed `您的回复已记录。` after submitting StoneSVN, official website, factual product description, Tim Pan and the authorized contact address. Selected No for the optional $10 queue jump. No payment or newsletter subscription. Received, awaiting review; no public listing yet. Form: https://docs.google.com/forms/d/e/1FAIpQLSfxtP1hx6kN9nkAYXquRq2eTG24_YPEx5-pHov2POonNLeuOw/viewform .
- AlternativeTo: user completed login as Tim-Pan; menu still disables Suggest new application with `You need to login and / or verify your account`. Banner asks to confirm email. Asked user to complete verification; prepared description, public screenshots and setup links saved in promotion-alternativeto.md. No submission yet.
- r/svn: https://www.reddit.com/r/svn/comments/1x96r5k/stonesvn_an_opensource_desktop_client_for/ . Submitted an SVN-focused introduction after checking the sidebar. The resulting page explicitly says removed by Reddit filters. This is not counted as exposure. No Reddit reposts or attempts to evade filters; prior SideProject filtering remains unresolved.

SEO/GEO: published https://stonesvn.github.io/en/guides/ as a visible directory grouping five existing setup/workflow guides. Added homepage navigation, article breadcrumbs and matching BreadcrumbList metadata. Hub uses CollectionPage and ItemList. Sitemap now has 11 unique URLs. No fabricated citations, ratings or repetitive guide text. Website commit 4aaaf1bc4ce929d01d63c7c86b50736b9fb3e518; deploy https://github.com/stonesvn/stonesvn.github.io/actions/runs/39143160423 completed successfully. Live HTTP 200 and parsed structured data confirmed for the hub and all five guides. Static validation and four release-fallback tests passed; ignored app preview source/generated pages synchronized. Existing Google/Bing requests are not repeated; no new indexing or AI citation progress confirmed this session.

Additional screening: SaaSHub requires an owned custom domain; opensourcealternative.to requires self-hosted software; LaunchingNext has a CAPTCHA; StartupStash Typeform was identified but not submitted. No paid placement, new account creation, emails, or CAPTCHA solving. The existing 12-hour follow-up should include Open Source Builders issue 591 and Startup Collections alongside prior submissions, and discover the hub and guides from sitemap; notify only on meaningful verified changes.

Desktop browser visual check confirmed the live guide directory renders with visible headings, descriptions and links; no mobile browser acceptance test was performed.

Final audit: all six existing catalog PRs (VCS 4, Tauri 27, macOS 1676, OSSDrop 87, DevShelf 92, Linux Apps 75) remain OPEN and unmerged, with zero PR comments. No new approval reported.


## AlternativeTo submission completed - 2026-10-19 CST

After the user verified email, Suggest new application became available. Submitted StoneSVN with Free / Open source / MIT, official website/source, Windows/Mac/Linux, svn-client tag, firzen author, official icon and English workspace screenshot. Description and platform notes retain external SVN requirement, OrcaSVN origin and current limitations; AI assistance disclosed in reviewer notes.

The site confirmed `StoneSVN is now submitted`. ID: 86b5a7b6-834f-4ce0-aaea-4fd774f1921d. Owner-only preview https://alternativeto.net/software/stonesvn/ explicitly says `Your submission is waiting to be reviewed` and `Only you can see this app right now`. Do not count or share this as a public listing. Declined paid review via No thanks, continue; remains in the normal free queue.

Suggested TortoiseSVN and SmartSVN as relevant alternatives; the preview now lists both (2 apps), confirming the associations. No ratings, votes or fake endorsements. Check https://alternativeto.net/my-submissions/ in the existing logged-in account during follow-up; notify only on actual approval/rejection or necessary user action. Full draft/status: promotion-alternativeto.md.


## macOS-focused promotion and sourced client comparison - 2026-10-19 CST

- macapps.org: https://macapps.org/submit . Submitted StoneSVN as Free / Open source / Developer Tools, with official site/repository and authorized contact email. Tagline focuses on Apple Silicon and Intel Mac working-copy review, selected commits and text-hunk stashes, and states the SVN CLI dependency. UI confirmed `Thanks — got it.` and `We'll review StoneSVN and publish it if it's a good fit.` Received, awaiting review; not yet a public listing.
- Open App Scout: https://github.com/tortuvshin/open-apps/pull/389 . One content/records/stonesvn.md record following CONTRIBUTING.md, existing developer-tools / tauri taxonomy, macos/windows/linux and mit values. Includes Mac-specific installation context, external CLI dependency, non-notarized builds, missing Merge/Switch/Blame UI, local stash scope and OrcaSVN source attribution. AI assistance disclosed; self-submission, not an independent endorsement. YAML parsed and taxonomy/title checked. Upstream Submission review bot returned `Verdict: ready`, `grove check: no errors or warnings`, no duplicate, active repository, MIT and valid taxonomy; all three PR checks passed. Human decision still pending; PR attached to chat. Full local draft: promotion-openappscout.md.

Published https://stonesvn.github.io/en/guides/svn-clients-macos-compared/ . Single workflow comparison of StoneSVN, Cornerstone, SmartSVN, SnailSVN and macSvn, based on official vendor feature pages checked 2026-10-19. Highlights free MIT workspace and selected-text-hunk stashes while accurately crediting Cornerstone's merge/annotations/checkpointing, SmartSVN's branch/annotation/conflict tools and SnailSVN/macSvn Finder integration. No speed, memory, compatibility or feature-parity superiority claim; no cross-client stash interchange claim. Uses source links, a visible project-authored disclosure, specific evaluation questions and switching checklist.

SEO/GEO implementation: static comparison table with horizontal-scroll wrapper, answer-first text, canonical/Open Graph/Twitter metadata, TechArticle and BreadcrumbList, dedicated directory category and homepage/related-guide links. Per-article editorial dates keep existing guides at 2026-10-18 and new comparison at 2026-10-19. Sitemap now has 12 unique URLs. Site commit b298edc663d6079d03688ff61a146c86aad6c85c, workflow https://github.com/stonesvn/stonesvn.github.io/actions/runs/39144387963 completed successfully. Live comparison HTTP 200, schemas and date confirmed. Static validator passed (5 locales, 15 screenshots); all 4 release-cache/fallback tests passed; all guide H1, internal paths, schema dates and sitemap uniqueness checked. Ignored app preview mirror synchronized. No new search indexing or AI citation result claimed from publishing.

Other Mac channels screened: MacTools requires a reciprocal homepage badge (not submitted/no badge added); MacNative explicitly rejects Tauri-only web interfaces unless substantial native integration qualifies, so not submitted; Bundl requires notarized direct downloads or public Homebrew/Mac App Store distribution, not currently met; OpenTosh unavailable through public fetch; Mac Apps Daily has an explicit submission-means-acceptance of terms and is not submitted. macss maker form requires a 512-square icon and exact 1200x630 cover; website analysis could not fetch the cover. Draft only, no Send app action and no receipt, so not counted as submitted. No Reddit reposts, emails, paid placement or new accounts.

Follow-up automation stonesvn remains active every 12 hours, now explicitly includes the new Mac-focused submissions, AlternativeTo owner-only pending status, Startup Collections and the comparison/directory URLs. Only verified meaningful changes notify.

Live desktop browser visual review confirmed that the new Mac comparison table, source links and navigation render correctly. A real mobile viewport test was not performed.
