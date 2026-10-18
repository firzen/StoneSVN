# StoneSVN

[官方网站](https://stonesvn.github.io)

简体中文 | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

StoneSVN 是采用 MIT 许可证的开源 SVN 桌面客户端，支持 Windows、macOS 和 Linux。围绕「查看变更 → 审阅差异 → 选择提交」组织日常操作，提供多工作副本管理、按目录部分提交和按文本分块贮藏，让 SVN 的日常工作集中在一个工作台中完成。

基于 Tauri、Rust 和 Vue 3 构建，调用本机 SVN CLI，保留 SVN 的集中式版本控制语义。

[下载安装包](https://github.com/firzen/StoneSVN/releases) · [快速使用](QUICKSTART.md) · [用户手册](docs/user-guide.md) · [与 Cornerstone 的功能对照](#与-cornerstone-的功能对照)

![StoneSVN 软件界面](docs/images/orcasvn-workspace.png)

当前源码的开发界面，2026-10-18 更新，包含当日工作台样式与项目入口调整；使用虚构项目、路径和差异数据，不含真实仓库或个人信息。[深色主题](docs/images/orcasvn-workspace-dark.png)。

## 主要特性

- **跨平台、开源**：Windows、macOS、Linux 使用同一套工作台，源码采用 MIT 许可证；支持简体中文、繁体中文、英语、日语、韩语和浅色／深色主题。
- **多工作副本切换**：持久项目栏支持拖动排序和宽度调整；当前会话中按项目保留提交草稿、勾选和筛选条件，切换项目后可继续审阅。
- **明确的提交范围**：按文件或目录独立勾选，通过「连同子项」批量选择目录内容，支持 Shift 连选；搜索隐藏的已选项仍计入总数，从 Diff 返回后保留选择和提交信息。
- **按文本分块贮藏**：选择整个文件或部分文本变更块，将未完成修改保存在本地，再恢复到原工作副本；恢复时可保留贮藏记录，或在恢复成功后移除记录。文本补丁可复制或导出。
- **集中审阅变更与历史**：按变更、未跟踪、冲突、缺失分类，预览文本差异和图片；通过提交时间线与分页文件历史查看历史差异，切换相邻版本。
- **属性与文件操作**：通过项目树和递归搜索定位文件，编辑常用 SVN 属性与自定义文本属性，导出不含 `.svn` 的工作副本内容，或将无本地修改的受控文件或目录恢复到指定版本；属性编辑与版本恢复结果需另行提交。
- **全局忽略规则**：在「设置 → 文件过滤」统一配置，启用后对所有工作副本生效；支持 `*`、`?` 和 `**` 通配符，隐藏匹配项，并在加入版本控制与提交时校验范围，减少误加入或误提交临时文件。

重新打开已缓存的工作区时，先展示上次列表，再验证最新状态；验证完成前提示缓存状态并限制相关变更操作。历史性能测量及适用边界见[性能基准](docs/workspace-startup-benchmark.md)。

## 与 Cornerstone 的功能对照

StoneSVN 适合以工作副本审阅、选择提交和临时保存修改为主的日常工作，尤其适用于同时使用多个操作系统的团队。涉及分支合并或逐行作者注释时，需要结合其他 SVN 工具。

| 能力 | StoneSVN 当前实现 | Cornerstone 4 官方介绍 |
| --- | --- | --- |
| 平台 | Windows、macOS、Linux | macOS |
| 工作副本与提交 | 多项目栏、状态分类、按文件／目录选择提交 | 工作副本浏览、提交时审阅差异 |
| 文本与图片 | 文本差异、图片预览 | 文本差异、图片差异比较 |
| 历史追踪 | 提交时间线、单文件历史与版本差异 | Log、Timeline、逐行 Annotations |
| 临时保存修改 | 本地贮藏，按文件或文本分块选择 | Shelving、Checkpointing |
| 分支合并 | 暂无通用 Merge 界面 | 多种合并策略与变更预览 |

对照依据：[Cornerstone 官方功能介绍](https://cornerstone.assembla.com/)与 [Shelving／Checkpointing 指南](https://cornerstone.assembla.com/cornerstone/helpbook/pages/working/shelving.html)，核对日期为 2026-10-17。以上为公开文档与当前源码的功能对照，未进行两款客户端的性能实测。

StoneSVN 的「追溯」目前提供文件提交历史，不提供逐行 Blame；图片预览不等同于图片差异比较。本地贮藏基于应用保存的补丁与未跟踪文件内容，不与 SVN 原生 Shelf 互通，也不提供 Cornerstone 式的多版本 Checkpoint 管理。

> StoneSVN 调用本机的 `svn` 命令行工具，不会自行实现 SVN 协议。

Switch 和通用 Merge 目前需使用其他 SVN 客户端或命令行完成，再回到 StoneSVN 刷新。冲突项目可选择保留当前内容并标记解决，或使用本地／仓库版本；目录和树冲突需先手动整理文件。属性页支持受控项目的重命名、移动、安排删除和目录递归还原；重命名、移动和安排删除仍需提交。工作区仓库信息下可迁移同一仓库的地址。

## 安装

从 [GitHub Releases](https://github.com/firzen/StoneSVN/releases) 下载 Windows、macOS 或 Linux 安装包。

macOS 安装包按芯片类型区分：Intel Mac 选择文件名含 `x64` 的 DMG；M 系列 Mac 选择 `aarch64`。可在「关于本机」确认芯片类型。

macOS 版本采用免费的 Ad-hoc 签名，未经过苹果公证。将 StoneSVN 拖入「应用程序」后，首次打开若被阻止，请进入「系统设置 → 隐私与安全性 → 仍要打开」，再确认「打开」。公司管理的 Mac 可能需要 IT 放行。详见 [macOS 构建与分发说明](docs/macos-distribution.md)。

应用使用外部 SVN CLI。Windows 上的中文路径与属性值处理取决于所用 SVN 的 Unicode／代码页支持；若出现字符替换，需使用支持相应字符的 SVN 命令行环境。

Windows、macOS、Linux 上自动探测 PATH 与常见 SVN 安装位置。探测失败时显示配置窗口，填写或选择可执行文件并通过验证后才能使用；无效路径不会保存。也可在「设置」中手动指定 SVN 完整路径。

安装后请确认 SVN CLI 可用：

```bash
svn --version --quiet
```

## 快速开始

1. 打开 StoneSVN，从项目栏底部选择「添加本地副本」打开已有工作副本，或选择「添加远程副本」检出仓库。
2. 在工作区按「变更、未跟踪、冲突、缺失」筛选文件。
3. 选择文件查看 Diff，确认后进入 Commit 页面提交。
4. 提交前先执行 Update，并优先解决冲突。

### 多项目工作区

左侧项目列表保留已添加的工作副本，支持拖动排序、右键操作和调整宽度；从列表移除项目不会删除本地文件。提交草稿与选择、工作区筛选和日志筛选按项目保留在当前会话中。项目变更数量来自最近一次成功扫描。

### 全局忽略

在「设置 → 文件过滤」启用过滤，每行填写一条规则，所有工作副本共用。示例：

```text
.gitignore
*.log
/_tmp1010/log*
**/node_modules
```

不带 `/` 的名称匹配任意层级；带 `/` 的路径从各工作副本根目录匹配。`*` 不跨目录，`?` 匹配单个字符，`**` 可跨目录；匹配目录时包含全部子项，不支持 `!` 取反。

这是 StoneSVN 的应用级过滤，不会修改 SVN 的 `svn:ignore` 或 `svn:global-ignores` 属性。默认规则仅匹配 `.gitignore` 文件本身，不读取其内容。加入版本控制与提交时也会检查过滤范围；递归添加的目录若包含过滤项，会提示逐项添加或调整规则。

### 属性、导出与文件历史

「属性」页提供项目文件树和递归搜索，右侧显示文件信息、仓库地址与 SVN 属性。可导出选中的受控文件或目录，保留本地修改且不包含 `.svn` 元数据；目标必须为尚不存在的新目录。

选中文件后可进入「追溯」查看分页历史，双击记录查看差异。属性页还支持将没有本地修改的受控文件恢复到指定版本；恢复结果是本地修改，检查后再提交。编辑属性与安排删除同样需要另行提交。

![StoneSVN 属性浏览与文件操作](docs/images/stonesvn-properties.png)

同一组虚构数据的属性页。[深色主题](docs/images/stonesvn-properties-dark.png)。

### 按目录部分提交

工作区以平铺文件列表展示变更。进入提交页后，文件和目录可独立勾选；需要批量选择目录范围时使用「连同子项」，也支持 Shift 连选。顶部显示提交范围和已选总数，搜索隐藏的已选项仍计入提交。查看 Diff 后返回会保留勾选和提交信息。

未跟踪目录先通过「加入版本控制并预览」展开文件列表，检查后再提交。删除或替换目录必须完整选择其子项；移动目录必须同时选择源目录、目标目录及相关子项变更；复制目录暂不支持部分提交。

入门步骤见 [快速使用](QUICKSTART.md)，完整操作与常见问题见 [用户手册](docs/user-guide.md)。

「时间线」页默认每页 20 条，可按作者、关键词和日期范围筛选；长作者名和提交信息省略显示，悬停查看全文。打开已缓存工作区时会先显示旧列表，再验证最新状态，未验证时显示提示并限制相关变更操作。

## 本地开发

要求：

- Node.js 18 或更高版本
- 最新稳定版 Rust
- SVN CLI 1.10 或更高版本
- 平台对应的 Tauri 2 构建依赖

```bash
npm ci
npm run tauri dev
```

提交改动前运行：

```bash
npm run check
```

详细环境配置和常见问题见 [SETUP.md](SETUP.md)，贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

当前正式版本为 **1.1.2**，更新内容见 [发布说明](docs/releases/v1.1.2.md)。正式发布步骤见 [发布流程](docs/releasing.md)，候选版本见 [预发布说明](docs/prerelease.md)，与 v0.6.2 的性能对照及测量边界见 [性能基准](docs/workspace-startup-benchmark.md)。

## 项目结构

```text
src/                    Vue 3 前端
  api/                  Tauri 命令调用封装
  composables/          可复用工作区逻辑
  i18n/                 多语言资源
  stores/               Pinia 状态
  views/                页面
src-tauri/src/
  main.rs               Tauri 命令边界
  svn/executor.rs       SVN 进程执行与超时
  svn/operations.rs     SVN 参数构造
  svn/parser.rs         XML/文本结果解析
.github/workflows/      发布流水线
```

## 设计原则

- **可预测**：界面操作尽量对应明确的 SVN 命令。
- **先审阅后变更**：默认先展示状态和差异，再执行提交或还原。
- **安全参数边界**：文件目标使用 `--` 与命令选项隔离。
- **清晰反馈**：错误保留 SVN 原始上下文，便于诊断。

界面颜色、文字、间距与组件尺寸见 [视觉规范](docs/visual-design-system.md)。

## 许可证

[MIT](LICENSE)
