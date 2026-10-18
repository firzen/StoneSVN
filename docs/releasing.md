# Stable releases

English | [简体中文](releasing.zh-CN.md)

Stable releases use `vX.Y.Z`. Do not create stable tags manually or move published tags. Prereleases use the [prerelease workflow](prerelease.md) and are not synchronized to the stable website.

## Prepare a release

1. Complete code and user documentation, and write the full GitHub Release notes in `docs/releases/vX.Y.Z.md`.
2. Add website summaries in `docs/releases/vX.Y.Z.website.json`, using `v1.1.2.website.json` as the schema reference. Include `en`, `zh-CN`, `zh-TW`, `ja`, and `ko`, each with a `title` and nonempty `items` array. The pipeline synchronizes reviewed copy without a machine-translation service.
3. Run `npm run release:prepare -- X.Y.Z` to synchronize six npm/Tauri/Cargo/lockfile version values. The version must increase and release notes must already be complete.
4. Review, commit, and push to `main`. Version/release-note changes trigger **Stable Release**. If the push token does not trigger Actions, run it manually in Actions or use:

```bash
gh workflow run tauri-build.yml --ref main
```

You do not need to create a tag, upload installers, or update the website manually.

## Automation and failure handling

The workflow pins the candidate commit SHA and validates versions and all five summaries. An already published version is skipped; ordinary development commits do not republish it.

1. Ubuntu x64, Windows x64, macOS Apple Silicon, and macOS Intel run `npm run check` (frontend build, Node regressions, Rust formatting/tests), then package installers. macOS also checks architecture and ad-hoc signatures.
2. Collect and verify nine assets: two Mac DMGs and app archives, Windows EXE/MSI, and Linux AppImage/DEB/RPM. Create the tag only after every platform succeeds and `main` still points to the candidate.
3. Create a draft, upload and verify each attachment's name, size, and upload state, then publish as Latest. Published versions cannot be overwritten. Failed drafts may be retried only with identical source.
4. The website's **Sync Release and Deploy** checks Latest every five minutes. It runs Vite from the release tag and creates light/dark workspace and Properties screenshots in five languages (15 images) with fictional documentation data and no real SVN operations. Capture tools and browser dependencies are pinned to the release tag; v1.1.2 uses an immutable compatibility-tool commit. It synchronizes summaries, time, version, and source SHA, generates static pages with release notes and SoftwareApplication metadata, then pushes to the website repository. Screenshot URLs include the source SHA to avoid stale caches.

Check/build failures create neither tag nor Release. Upload failures leave a private draft; fix infrastructure and rerun, or prepare a new candidate if source must change. A new commit on `main` during checks causes the publication gate to reject the old candidate; rerun on current `main`.

Website failure does not retract a published release. The next scheduled check automatically retries, including deployment failures after the summary was committed. For an immediate retry, run **Sync Release and Deploy** in the website repository, using Latest, or:

```bash
gh workflow run sync-release.yml --repo stonesvn/stonesvn.github.io --ref main
```

Only the current Latest stable release may synchronize, preventing old jobs from restoring older versions. Website pushes use normal fast-forward updates. Concurrent maintenance causes failure rather than overwriting content; rerun afterward.

## Website permissions and deployment

The website repository disables deploy keys, so synchronization is pull-based, without cross-repository keys or personal tokens. Its `GITHUB_TOKEN` writes only website content; a separate deployment job has only `pages: write` and `id-token: write`. Only the application workflow's final publish job has `contents: write`.

The website's `.github/workflows/sync-release.yml` checks Latest every five minutes; GitHub schedules may be delayed. With no new version and a successful previous deployment, it skips dependency installation, screenshots, and deployment. After 30 days without repository commits, it creates one empty maintenance commit to keep scheduled synchronization active without changing pages. A new stable version generates five-language content/screenshots, pushes generated files, and uses `deploy-pages` directly rather than depending on bot commits to trigger another workflow. Configure Pages build type as workflow.

Run the website workflow manually for immediate synchronization. Template/style pushes to `main` also redeploy. Push conflicts abort and retry on the next run without force-pushing.

## Validate the workflow itself

Select `validate_only` in **Stable Release**, or run:

```bash
gh workflow run tauri-build.yml --ref main -f validate_only=true
```

This checks and packages all four platforms, retains build artifacts for seven days, and creates no tag/release or website changes. Use it to validate pipeline changes.

Windows uses SlikSVN 1.14.5 and enables UTF-8 only for temporary CI SVN processes, retaining multilingual-path regressions. SVN is not bundled with installers. macOS is ad-hoc signed and not notarized. CI checks, packaging, and screenshots do not replace manual installation, startup, and real-repository acceptance on each platform.

The official repository is `firzen/StoneSVN`; installers are distributed through GitHub Releases. The application identifier remains `com.orcasvn.desktop` for existing local-data compatibility. Historical WinGet distribution identifiers are not reused.
