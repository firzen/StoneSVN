# macOS 构建与分发

StoneSVN 使用 Ad-hoc 签名（`bundle.macOS.signingIdentity` 为 `-`），无需苹果开发者账号或签名证书。此签名不提供经过苹果认证的开发者身份，安装包未经过苹果公证，首次运行仍可能被 Gatekeeper 阻止。

## 安装与首次打开

1. 从项目 GitHub Releases 下载对应架构的 DMG：Intel 选择 `x64`，Apple Silicon 选择 `aarch64`。
2. 打开 DMG，将 StoneSVN 拖入「应用程序」。
3. 尝试打开 StoneSVN。如果系统阻止打开，确认安装包来自可信来源后，进入「系统设置 → 隐私与安全性」，点击「仍要打开」，再确认「打开」。系统会保存该应用的例外；更新版本后可能需要再次确认。
4. 安装本机 SVN CLI，并运行 `svn --version --quiet` 确认可用。使用 Homebrew 的用户可以运行 `brew install subversion`。StoneSVN 会自动探测，也可以在设置中选择 SVN 可执行文件。

公司统一管理的 Mac 可能无法自行添加例外，需要 IT 管理员放行。无需关闭整个系统的 Gatekeeper。若提示应用已损坏，应重新下载并检查签名，不应直接视为普通的开发者身份提示。

## 本地构建

在 Mac 上准备 Node.js、npm、Rust 和 Xcode Command Line Tools，然后在项目根目录执行：

```bash
npm ci
npm run tauri build -- --bundles dmg
```

默认构建当前 Mac 的架构，DMG 位于 `src-tauri/target/release/bundle/dmg/`。可检查应用签名：

```bash
codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/StoneSVN.app
codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/StoneSVN.app
```

签名信息应包含 `Signature=adhoc`。签名验证成功不代表通过苹果公证或 Gatekeeper 信任检查；本机生成的应用也不能替代从浏览器下载后的首次安装测试。

## GitHub 发布

稳定版工作流分别在 Apple Silicon 和 Intel macOS 运行器上构建，公共 Tauri 配置确保两种架构都采用 Ad-hoc 签名。无需设置苹果签名或公证相关 Secrets。

发布前同步更新 npm、Cargo、锁文件和 Tauri 的版本，在 `docs/releases/vX.Y.Z.md` 添加发布说明，再推送对应版本标签。现有工作流会在所有平台构建成功后发布 Release。

参考：[Tauri Ad-hoc 签名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)、[苹果首次打开说明](https://support.apple.com/zh-cn/102445)。
