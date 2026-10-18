# 开发环境

[English](SETUP.md) | 简体中文

## 前置依赖

安装并验证 Node.js、Rust 和 SVN CLI：

```bash
node --version
npm --version
rustc --version
cargo --version
svn --version --quiet
```

Windows 还需要 Visual Studio C++ Build Tools 和 WebView2。Linux、macOS 的系统依赖请参考 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)。

## 启动项目

```bash
npm ci
npm run tauri dev
```

仅调试前端时可以运行 `npm run dev`，但所有 SVN 操作都依赖 Tauri 后端。

## 验证改动

```bash
npm run check
```

该命令依次检查前端类型和构建、运行前端单元测试，再检查 Rust 格式并运行 Rust 单元测试。

## 发布构建

```bash
npm run tauri build
```

安装包和二进制产物位于 `src-tauri/target/release/`。推送 `vX.Y.Z` 标签（例如 `v0.6.3`）时，正式发布流水线校验全部版本文件、运行三平台检查并打包，全部成功后公开 Release 并标记为 Latest，详见[发布流程](docs/releasing.zh-CN.md)。预发布标签（例如 `v0.6.3-rc.1`）由独立流水线处理，详见[预发布说明](docs/prerelease.zh-CN.md)。

## 排查问题

### 找不到 SVN

启动时先验证自定义路径；未指定时，自动探测 PATH 与系统常见位置：

- Windows：SlikSVN、TortoiseSVN、VisualSVN、CollabNet 的标准安装目录，以及 Chocolatey、Scoop 和用户安装目录。
- macOS：Homebrew（`/opt/homebrew/bin/svn`、`/usr/local/bin/svn`）、MacPorts（`/opt/local/bin/svn`）及系统目录。
- Linux：`/usr/bin/svn`、`/usr/local/bin/svn`、`/bin/svn`、`/snap/bin/svn`、`/opt/subversion/bin/svn` 和 `~/.local/bin/svn`。

探测失败时显示「配置 SVN 路径」窗口。先安装 SVN CLI，再填写完整文件路径，或使用「浏览」选择 `svn.exe`（Windows）／`svn`（macOS、Linux）。选择安装目录或工作区无效。点击「验证并继续」，通过验证后才加载工作区；无效配置不会保存。也可点击「重新自动探测」。

也可在「设置」中手动填写可执行文件路径。例如 Intel Mac 的 Homebrew 常见路径为 `/usr/local/bin/svn`。

### Windows 编译失败

确认 Rust 使用 MSVC 工具链，并安装 Visual Studio 的“使用 C++ 的桌面开发”工作负载。

### 端口 1420 被占用

开发服务器要求固定使用 1420 端口。结束占用进程后重新运行 `npm run tauri dev`。
