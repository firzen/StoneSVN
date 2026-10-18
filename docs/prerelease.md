# Prereleases

English | [简体中文](prerelease.zh-CN.md)

Push `vX.Y.Z-alpha.N`, `vX.Y.Z-beta.N`, or `vX.Y.Z-rc.N` to trigger `.github/workflows/prerelease.yml`, for example `v0.6.3-rc.1`.

Before tagging, synchronize these versions to the tag without `v` (for example `0.6.3-rc.1`) and commit:

- `package.json`
- Top-level/root-package versions in `package-lock.json` (`npm install --package-lock-only` can update them)
- `src-tauri/Cargo.toml`
- The StoneSVN package in `src-tauri/Cargo.lock` (`cargo check --manifest-path src-tauri/Cargo.toml` can update it)
- `src-tauri/tauri.conf.json`

```powershell
# Example only: synchronize all versions and commit release changes first.
$env:RELEASE_TAG = 'v0.6.3-rc.1'
node scripts/validate-prerelease.cjs
npm run check
git tag v0.6.3-rc.1
git push origin v0.6.3-rc.1
```

The workflow validates versions and creates a draft. Windows, macOS, and Linux install SVN, run complete checks, package, and upload. After every platform succeeds, it publishes a Pre-release with GitHub-generated notes, without marking Latest. Failures retain the draft; rerun failed jobs in Actions.

Windows installs SlikSVN 1.14.5 at `C:\Tools\SlikSvn`, checks `svn.exe`/`svnadmin.exe` under `bin`, and adds that directory to PATH. Release-ID lookup retries up to five times after draft creation to handle delayed listing updates. Create a new candidate tag after workflow fixes: rerunning an old job still uses the workflow at the old tag.

Windows prereleases produce only NSIS EXE installers because MSI does not support identifiers such as `alpha.N`, `beta.N`, or `rc.N`. Stable packaging retains all original targets, including EXE and MSI.

Use lowercase alpha/beta/rc channels and numbers without extra leading zeroes. Synchronize every version before pushing; validation cannot be skipped. Prereleases run only on tag pushes, without a manual branch-selection entry point.

Ensure `GITHUB_TOKEN` can write Releases. The Release ID must resolve to one numeric value before building. Published same-name releases reject a complete rerun; create a new tag. Failed drafts can be reused. Never force-move a published tag.

Run `node --test tests/prerelease.test.cjs` for tag rules, version consistency, Windows line endings, and missing lockfile-package records; use actionlint for workflow validation. Actual cross-platform packaging/publication must be confirmed in GitHub Actions.

Stable releases exclude prerelease tags and follow the [current stable release workflow](releasing.md), including reviewed notes from `docs/releases/vX.Y.Z.md`. Preparing version files alone does not publish a release.
