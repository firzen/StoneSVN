# 预发布

推送 `vX.Y.Z-alpha.N`、`vX.Y.Z-beta.N` 或 `vX.Y.Z-rc.N` 标签触发 `.github/workflows/prerelease.yml`，例如 `v0.6.3-rc.1`。

发布前，将以下版本统一为不带 v 的标签版本（例如 `0.6.3-rc.1`），提交后再创建并推送标签：

- `package.json`
- `package-lock.json` 顶层及根包版本（可用 `npm install --package-lock-only` 更新）
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` 的 StoneSVN 包版本（可用 `cargo check --manifest-path src-tauri/Cargo.toml` 更新）
- `src-tauri/tauri.conf.json`

```powershell
# 以下标签仅为示例；先同步全部版本文件并提交待发布改动。
$env:RELEASE_TAG = 'v0.6.3-rc.1'
node scripts/validate-prerelease.cjs
npm run check
git tag v0.6.3-rc.1
git push origin v0.6.3-rc.1
```

流程先校验版本并创建 GitHub Release 草稿；Windows、macOS、Linux 分别安装 SVN 工具、运行完整检查并打包上传。全部平台成功后公开为 Pre-release，使用 GitHub 自动生成的更新说明，不标记为 Latest，也不发布到 WinGet。任何平台失败时保留草稿，可在 Actions 中重跑失败任务。

Windows 固定安装 SlikSVN 1.14.5 到 `C:\Tools\SlikSvn`，核验 `bin` 下的 `svn.exe` 与 `svnadmin.exe`，再将该目录加入后续任务的 PATH。草稿创建后读取 Release ID 最多重试 5 次，以应对列表短暂未同步。修复流水线后应创建新的候选版本标签；重跑旧任务仍使用旧标签对应的流程。

Windows 预发布仅生成 NSIS EXE 安装包，因为 MSI 目标不支持 `alpha.N`、`beta.N`、`rc.N` 这样的非数字预发布标识。正式版本仍使用原有的全部打包目标，包括 EXE 和 MSI。

标签必须使用小写 alpha、beta、rc 通道，数字不得包含多余前导零。推送标签前必须同步全部版本文件，不能跳过版本校验。工作流仅在标签被推送后运行，不提供手动选择分支发布入口。

首次使用时确认仓库允许 GitHub Actions 的 `GITHUB_TOKEN` 写入 Releases；流程无需 WinGet PAT。Release ID 必须解析为唯一数值后才进入构建。已公开的同名版本会拒绝重跑整个流程，请为新版本创建新标签；失败的草稿可复用，不要强制移动已有发布标签。

本地可运行 `node --test tests/prerelease.test.cjs` 检查标签规则、版本一致性、Windows 换行及缺失锁文件包记录；使用 actionlint 校验工作流。跨平台安装包和最终发布仍需由 GitHub Actions 实际执行确认。

正式发布工作流排除包含连字符的预发布标签，由 `vX.Y.Z` 标签触发；同样先校验版本并创建草稿，全部平台检查和打包成功后公开为 Latest，再尝试发布 WinGet。正式版更新说明从 `docs/releases/vX.Y.Z.md` 读取，步骤见[发布流程](releasing.md)。准备版本文件本身不会发布版本，只有推送标签才触发流水线。
