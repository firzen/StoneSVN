# Contributing

English | [简体中文](CONTRIBUTING.zh-CN.md)

Thank you for contributing to StoneSVN. Keep changes focused and verifiable, and keep interface semantics consistent with SVN CLI behavior.

Coding agents must read [AGENTS.md](AGENTS.md), including the release and website completion checklist.

## Development workflow

1. Create a short-lived branch from `main`.
2. Install locked dependencies with `npm ci`.
3. Implement the change and add tests for pure logic such as parsing and argument construction.
4. Run `npm run check`.
5. Describe user-visible behavior, risks, and validation in the pull request.

Complete SVN integration tests require both `svn` and `svnadmin`; some Rust tests return early when either tool is unavailable. Native USN tests also require permission to read an NTFS volume. A passing test run alone does not establish that this path was exercised.

Performance benchmarks are explicitly run ignored tests. See [workspace loading benchmarks](docs/workspace-startup-benchmark.md) for scope and rerun instructions, the [release workflow](docs/releasing.md) for stable releases, version validation, and retries, and the [prerelease workflow](docs/prerelease.md) for candidates.

## Code conventions

- Use Vue 3 Composition API, TypeScript, and existing Pinia/composable patterns in the frontend.
- Preserve the responsibility boundaries between `executor`, `operations`, and `parser` in the backend.
- Put file-path arguments after SVN's `--` argument boundary.
- Update every locale when adding user-visible text.
- Do not commit `dist/`, `node_modules/`, or `src-tauri/target/`.

## Documentation languages

- Unsuffixed Markdown files, including `README.md`, `QUICKSTART.md`, and documents under `docs/`, are English by default.
- Keep Simplified Chinese translations in sibling `.zh-CN.md` files and provide reciprocal language links. Chinese documents should link to Chinese counterparts where available.
- The English README is `README.md`; its Simplified Chinese counterpart is `README.cn.md`. Other Simplified Chinese documents use `.zh-CN.md`. Existing `.zh-TW.md`, `.ja.md`, and `.ko.md` files retain their languages.
- Update affected translations and language-specific heading links together. Preserve historical benchmark data and validation limits when translating technical records.

## Commit messages

Prefer concise Conventional Commits:

```text
feat: add conflict status filter
fix: separate svn file targets from options
docs: clarify local development workflow
```
