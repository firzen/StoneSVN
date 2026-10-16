# StoneSVN

简体中文 | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

StoneSVN 是一个基于 Tauri、Rust 和 Vue 3 的跨平台 SVN 桌面客户端。它借鉴 Git 客户端清晰的工作区体验，同时保留 SVN 的集中式版本控制语义。

![StoneSVN 软件界面](docs/images/orcasvn-workspace.png)

当前源码的开发界面，2026-10-16 更新，包含当日工作台样式与项目入口调整；使用虚构项目、路径和差异数据，不含真实仓库或个人信息。[深色主题](docs/images/orcasvn-workspace-dark.png)。

## 核心能力

- 持久项目栏支持多工作副本切换、拖动排序和宽度调整；顶栏集中常用操作
- 可配置文件过滤规则，支持 `*`、`?` 和 `**` 通配符，并在加入版本控制与提交时校验范围
- 预览文本差异和图片，为二进制文件与目录提供外部打开入口
- 通过项目树与递归文件搜索浏览属性，编辑常用 SVN 属性和自定义文本属性；应用后仍需提交
- 以类似 `git status` 的分类查看本地变更、未版本文件、冲突和缺失文件
- 检出、更新、按文件或目录选择提交、加入版本控制、还原和清理工作副本
- 本地贮藏：按文件或文本分块保存修改，并恢复到原工作区
- 查看提交时间线和单文件历史，打开历史版本差异并切换相邻版本
- 支持简体中文、繁体中文、英语、日语和韩语
- 支持浅色、深色主题以及 Windows、macOS、Linux

> StoneSVN 调用本机的 `svn` 命令行工具，不会自行实现 SVN 协议。

Switch、通用 Merge 和冲突 Resolve 目前需使用其他 SVN 客户端或命令行完成，再回到 StoneSVN 刷新。工作区中的「删除」按钮用于删除未跟踪文件；属性页支持为受控文件或目录安排删除，确认后仍需提交。

## 安装

从 [GitHub Releases](https://github.com/firzen/StoneSVN/releases) 下载 Windows、macOS 或 Linux 安装包。

macOS 安装包按芯片类型区分：Intel Mac 选择文件名含 `x64` 的 DMG；M 系列 Mac 选择 `aarch64`。可在「关于本机」确认芯片类型。

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

### 属性、导出与文件历史

「属性」页提供项目文件树和递归搜索，右侧显示文件信息、仓库地址与 SVN 属性。可导出选中的受控文件或目录，保留本地修改且不包含 `.svn` 元数据；目标必须为尚不存在的新目录。

选中文件后可进入「追溯」查看分页历史，双击记录查看差异。属性页还支持将没有本地修改的受控文件恢复到指定版本；恢复结果是本地修改，检查后再提交。编辑属性与安排删除同样需要另行提交。

![StoneSVN 属性浏览与文件操作](docs/images/stonesvn-properties.png)

同一组虚构数据的属性页。[深色主题](docs/images/stonesvn-properties-dark.png)。

### 按目录部分提交

工作区以平铺文件列表展示变更。进入提交页后，文件和目录可独立勾选；需要批量选择目录范围时使用「连同子项」，也支持 Shift 连选。顶部显示提交范围和已选总数，搜索隐藏的已选项仍计入提交。查看 Diff 后返回会保留勾选和提交信息。

未跟踪目录先通过「加入版本控制并预览」展开文件列表，检查后再提交。删除或替换目录必须完整选择其子项；复制或移动目录暂不支持部分提交，会提示使用 SVN 客户端处理完整操作。

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

当前正式版本为 **1.0.1**，更新内容见 [发布说明](docs/releases/v1.0.1.md)。正式发布步骤见 [发布流程](docs/releasing.md)，候选版本见 [预发布说明](docs/prerelease.md)，与 v0.6.2 的性能对照及测量边界见 [性能基准](docs/workspace-startup-benchmark.md)。

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
