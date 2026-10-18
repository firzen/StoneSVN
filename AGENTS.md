# StoneSVN repository instructions

## Scope and conventions

- Application repository: `firzen/StoneSVN`. Website repository: `stonesvn/stonesvn.github.io`; public URL: https://stonesvn.github.io/.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) for code and documentation conventions. Unsuffixed documentation is English; Simplified Chinese translations use `.zh-CN.md`, except `README.cn.md`.
- Run commands from the repository root. If PHP is needed, use `/Applications/XAMPP/bin/php`.
- Preserve unrelated working-tree changes. Stage task files explicitly. Do not publish other tasks' draft promotion files or generated output accidentally.
- An application checkout's `website/` folder is an ignored local preview mirror, not the website Git repository. Verify the Git root and remote before committing website changes.

## When asked to release

Use [docs/releasing.md](docs/releasing.md) ([简体中文](docs/releasing.zh-CN.md)) as the release runbook. A request to document or maintain this process alone does not request a new release.

1. Inspect Git status, branch, remotes, current package version, and GitHub's latest published stable release. Honor a user-specified version. Otherwise reuse a valid prepared unpublished candidate, or choose the next appropriate stable version from the actual change scope and state the choice. Summarize actual changes since the previous stable tag; do not treat a historical example as the next version.
2. Prepare `docs/releases/vX.Y.Z.md` and `docs/releases/vX.Y.Z.website.json`. Website summaries require `en`, `zh-CN`, `zh-TW`, `ja`, and `ko`, each with a nonempty `title` and `items` array. Review the copy; there is no automatic translation service.
3. Update active README version references and affected user documentation/translations. Keep historical release notes, benchmarks, and explicitly version-pinned guides accurate; do not bulk-replace historical versions.
4. If the version still needs to increase, run `npm run release:prepare -- X.Y.Z`, then `npm run release:check`. For an already-prepared candidate, run only `npm run release:check`; prepare deliberately rejects the current version. The prepare command updates all six npm/Tauri/Cargo version values. Do not use `npm version` alone or edit only one version file.
5. Run appropriate local checks, including `npm run check` for a release. Confirm both `svn` and `svnadmin` are available so integration tests actually exercise SVN. When interface changes affect captures, update `docs/images/workspace-demo.js` and `scripts/capture-website.cjs`, and verify all five capture languages with fictional data.
6. Review and commit the candidate, then push to `main`. Inspect Actions for a **Stable Release** run matching the pushed commit SHA. If the push did not start a matching publication run, dispatch it explicitly:

   ```sh
   gh workflow run tauri-build.yml --repo firzen/StoneSVN --ref main
   ```

7. Wait for completion and perform the verification checklist in the runbook. Dispatching a workflow or successfully pushing commits is not release completion. Keep the user informed during the native builds.

## Release gates and retries

- Stable tags are created by `.github/workflows/tauri-build.yml` only after all four targets pass checks and packaging: Ubuntu x64, Windows x64, macOS Apple Silicon, and macOS Intel. Never create a stable tag manually to start this workflow or bypass a failed target.
- Preserve `tauri-apps/tauri-action` build-only mode (no `releaseId` or `tagName` in the desktop jobs), its macOS DMG environment, and bounded retries. Do not replace it with a bare CLI invocation that drops those settings. Keep Windows SVN UTF-8 setup, CRLF-safe version preparation, architecture checks, and macOS signature checks.
- The publisher verifies nine distribution files, creates a draft, verifies uploaded names/sizes/states, and then publishes Latest. Do not move published tags or overwrite published assets.
- The publisher rejects a candidate if `main` advanced during checks. Source or workflow fixes require a fresh run on the intended current source; rerunning an old run does not load new workflow code. Follow the runbook for an already-created tag/draft.
- `validate_only=true` checks and packages without tagging or publishing. A successful validation run is not a published release. A normal run skips a version that is already public.

  ```sh
  gh workflow run tauri-build.yml --repo firzen/StoneSVN --ref main -f validate_only=true
  ```

- Prereleases follow [docs/prerelease.md](docs/prerelease.md), not the stable workflow, and must not replace the stable website.

## Website synchronization and completion

- The website's `sync-release.yml` pulls Latest on a five-minute schedule; GitHub scheduling can be delayed. It uses its own `GITHUB_TOKEN`, not cross-repository deploy keys or personal tokens.
- Website updates use the published tag's app source, capture tools, and browser dependencies. Preserve the existing immutable compatibility path for older tags. Five locales each need light/dark Workspace and Properties screenshots: 15 PNGs total, 1440×900.
- For an immediate sync or website-only retry, run:

  ```sh
  gh workflow run sync-release.yml --repo stonesvn/stonesvn.github.io --ref main
  ```

- Check both the website build and Pages deployment. Verify `source/release.json` matches the published tag and its source commit, all five pages contain the new notes/version, screenshot language/theme matches, and the seven primary download links use the actual new assets.
- Report the version, release URL, checked targets, website result, and any remaining failure. Do not report completion while required jobs or deployment are still pending. CI packaging does not establish manual installation/startup acceptance on every OS.
