# 正式发布

正式标签使用 `vX.Y.Z`；预发布标签使用 `vX.Y.Z-alpha.N`、`beta.N` 或 `rc.N`，见[预发布流程](prerelease.md)。不要移动已公开版本的标签。

## 发布前

将 `package.json`、`package-lock.json` 顶层及根包版本、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 的 StoneSVN 包版本、`src-tauri/tauri.conf.json` 统一为正式版本。更新用户文档及 `docs/releases/vX.Y.Z.md`；发布流水线从该文件读取公开更新说明。

在项目根目录运行：

```bash
RELEASE_TAG=v1.0.0 node scripts/validate-release.cjs
npm run check
```

版本校验拒绝预发布标识、前导零、缺失或不一致的版本。截图日期、历史性能记录保留原始来源；新基准应记录提交、环境、测量边界和可重跑方法，不能把原生数据请求耗时当作桌面启动耗时。

确认发布范围并提交、推送到 `main` 后创建标签：

```bash
git tag -a v1.0.0 -m "StoneSVN v1.0.0"
git push origin v1.0.0
```

## 项目标识与分发渠道

StoneSVN 是独立项目，正式仓库为 `firzen/StoneSVN`，安装包通过该仓库的 GitHub Releases 分发。已取消 WinGet 发布，不复用 OrcaSVN 的包标识或发布渠道。

当前源码仍保留应用标识 `com.orcasvn.desktop` 和旧本地存储键；品牌图形使用 StoneSVN 图标。历史发行说明、审校截图及上游问题链接保留原始记录。

## 自动流程

`.github/workflows/tauri-build.yml` 只处理正式标签：

1. 校验所有版本文件和发布说明，创建或复用 GitHub Release 草稿；已公开的同名版本拒绝重新发布。
2. Windows、macOS、Linux 安装 SVN 测试工具，运行 `npm run check`，打包并将安装包上传至同一个草稿。
3. 所有平台成功后才公开为正式版并标记 Latest。

Windows 固定使用 SlikSVN 1.14.5，核验 svn 与 svnadmin 后加入 PATH；正式版本生成 NSIS EXE 和 MSI。macOS 使用 `macos-latest` 的原生架构，当前为 Apple Silicon；Linux 使用 Ubuntu x64。

任一平台失败时，Release 保持草稿，Latest 不变。在 Actions 中重跑失败任务；流程代码修改不会应用到旧标签上的重跑。需要新的源码或流程修复时使用新的版本标签，不强制移动已发布标签。

## 发布后验证

检查 Actions 三平台检查、打包和公开步骤，以及 Release 的版本、说明、Latest 标记和实际安装包列表。本地检查和 CI 构建不能替代在各操作系统上安装、启动和真实仓库操作的验收。
