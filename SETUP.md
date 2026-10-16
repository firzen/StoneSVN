# 开发环境

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

安装包和二进制产物位于 `src-tauri/target/release/`。推送 `vX.Y.Z` 标签（例如 `v0.6.3`）时，正式发布流水线校验全部版本文件、运行三平台检查并打包，全部成功后公开 Release 并标记为 Latest，详见[发布流程](docs/releasing.md)。预发布标签（例如 `v0.6.3-rc.1`）由独立流水线处理，详见[预发布说明](docs/prerelease.md)。

## 排查问题

### 找不到 SVN

确保 `svn` 位于当前用户的 `PATH` 中，然后重新启动 StoneSVN。

### Windows 编译失败

确认 Rust 使用 MSVC 工具链，并安装 Visual Studio 的“使用 C++ 的桌面开发”工作负载。

### 端口 1420 被占用

开发服务器要求固定使用 1420 端口。结束占用进程后重新运行 `npm run tauri dev`。
