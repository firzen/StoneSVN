# Stable releases

English | [简体中文](releasing.zh-CN.md)

Stable releases use `vX.Y.Z`. Do not create stable tags manually or move published tags. Prereleases use the [prerelease workflow](prerelease.md) and are not synchronized to the stable website.

## Prepare a release

1. Complete code and user documentation, and write the full GitHub Release notes in `docs/releases/vX.Y.Z.md`.
2. Add website summaries in `docs/releases/vX.Y.Z.website.json`, using `v1.1.2.website.json` as the schema reference. Include `en`, `zh-CN`, `zh-TW`, `ja`, and `ko`, each with a `title` and nonempty `items` array. The pipeline synchronizes reviewed copy without a machine-translation service.
3. Run `npm run release:prepare -- X.Y.Z` to synchronize six npm/Tauri/Cargo/lockfile version values. The version must increase and release notes must already be complete. Empty Markdown notes are rejected before any version is changed. Run `npm run release:check` afterward to validate the six versions, full notes, and all five website summaries without modifying files.
4. Review, commit, and push to `main`. Version/release-note changes trigger **Stable Release**. If the push token does not trigger Actions, run it manually in Actions or use:

```bash
gh workflow run tauri-build.yml --repo firzen/StoneSVN --ref main
```

You do not need to create a tag, upload installers, or update the website manually.

## Codex handoff and release completion

[AGENTS.md](../AGENTS.md) is the durable entry point for coding agents. Read it before a future release; do not depend on chat history or temporary checkout paths. Documentation/workflow maintenance alone does not request a new release.

Run from the app repository root:

```bash
npm run release:check
candidate=$(git rev-parse HEAD)
gh run list --repo firzen/StoneSVN --workflow tauri-build.yml --commit "$candidate" --json databaseId,displayTitle,status,conclusion,url
```

If the intended unpublished version is already prepared, run `release:check` directly; do not run `release:prepare` again with the current version. Inspect existing matching runs before dispatching another one. New run titles distinguish `Release stable` from `Validate stable`. If no publication run started after the push, use the explicit dispatch command above. Watch the selected run to completion:

```bash
gh run watch RUN_ID --repo firzen/StoneSVN --exit-status
```

A release request is complete only after all of these checks:

- All four desktop jobs pass, and the publish job succeeds for the intended source SHA. A validation-only success or an already-published-version skip does not publish a new version.
- The intended tag resolves to the checked candidate. The GitHub Latest release has the intended tag, `draft: false`, `prerelease: false`, reviewed notes, and all nine distribution files. Inspect actual asset names and URLs, not just the count.
- The website build and Pages deployment succeed. If immediate synchronization was requested, start `sync-release.yml` explicitly rather than reporting a future scheduled update as finished.
- Website `source/release.json` contains the intended tag and the commit resolved by that tag. Check five static release-note sections/version metadata, 15 localized screenshots and theme switching, and the seven primary download links against the actual release assets.

Useful read-only verification commands:

```bash
gh api repos/firzen/StoneSVN/releases/latest --jq '{tag: .tag_name, draft, prerelease, assetCount: (.assets | length), url: .html_url}'
gh api repos/firzen/StoneSVN/commits/vX.Y.Z --jq .sha
gh api -H 'Accept: application/vnd.github.raw+json' repos/stonesvn/stonesvn.github.io/contents/source/release.json --jq '{tag, sourceSha}'
gh run list --repo stonesvn/stonesvn.github.io --workflow sync-release.yml --json databaseId,status,conclusion,url
```

Keep the user updated while native builds run. The final report should include the version/release URL, checked targets, website result, and any remaining failure. Preserve unrelated draft files; publish website source only from its separate repository, not the app's ignored `website/` preview mirror.

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
gh workflow run tauri-build.yml --repo firzen/StoneSVN --ref main -f validate_only=true
```

This checks and packages all four platforms, retains build artifacts for seven days, and creates no tag/release or website changes. Use it to validate pipeline changes.

Windows uses SlikSVN 1.14.5 and enables UTF-8 only for temporary CI SVN processes, retaining multilingual-path regressions. SVN is not bundled with installers. macOS is ad-hoc signed and not notarized. CI checks, packaging, and screenshots do not replace manual installation, startup, and real-repository acceptance on each platform.

## Build caching and timing

The stable workflow uses a dedicated Rust cache per runner platform, populated only after a successful job. This keeps both test dependencies and the release/custom-protocol dependencies built by Tauri, including explicit macOS target directories, separate from CI and prerelease caches. Rust compiler, dependency, and configuration changes still affect the cache key. Exact cache hits are immutable: if a future workflow changes which targets or features are built without changing dependencies, increment the `stable-release-v1` cache namespace to populate a complete cache again. A new namespace needs one successful cold run before measuring a warm run.

Every platform still runs `npm run check`. Packaging uses `src-tauri/tauri.ci.conf.json` only after that step succeeds, reusing the frontend in `dist` instead of rebuilding it. Normal local Tauri builds keep their frontend build hook. Keep the action's build-only mode, retries, DMG environment, architecture/signature checks, and nine-asset publication gate when optimizing further.

Compare two `validate_only=true` runs of the same source to measure cold and warm cache performance without publishing. Inspect individual step durations and Rust `Finished` messages; the slowest desktop job determines release time. Website synchronization is a separate build/deployment and should be measured separately.

The official repository is `firzen/StoneSVN`; installers are distributed through GitHub Releases. The application identifier remains `com.orcasvn.desktop` for existing local-data compatibility. Historical WinGet distribution identifiers are not reused.
