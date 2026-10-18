# OrcaSVN performance optimization record

English | [简体中文](performance-optimization.zh-CN.md)

This technical record describes the implementation and measurements at the time of the changes. Historical ignore-rule behavior is not the current Settings filter contract; see the [user guide](user-guide.md#settings-and-display).

## Log pagination

Log uses revision cursors and explicit Previous/Next navigation with 20 entries per page. Scrolling/container height no longer triggers requests. Ordinary, author, keyword, and date queries request at most 21 matches; the extra entry detects a next page. Next starts at the last displayed revision minus one, retaining the extra match.

Navigation replaces rather than accumulates records. Visited pages use a 50-entry, five-minute cache. Filter/workspace changes and manual queries reset to page one; request generations prevent stale responses overwriting a new page.

Author width is 180px and message minimum width 220px. Long text stays on one line with native full-text hover hints; row data/details retain complete values.

Rust still filters author/keyword in batches rather than `svn log --search` to retain existing semantics. Page size is bounded, but sparse/no matches may scan substantial history; pagination does not bound query time.

## Ignore matching

A Web Worker matches rules instead of blocking the UI with regular expressions. Searching backward preserves last-match-wins and negation semantics of this historical implementation.

The worker caches up to 10,000 paths and rebuilds when rule content changes. Workspace/generation checks reject outdated replies. Disabled filtering directly returns the list.

## SVN execution

`tokio::process::Command` asynchronously waits for completion, replacing 100ms polling and two pipe-reader threads per command. Tokio drains stdout/stderr concurrently.

Retain the 120-second timeout, noninteractive options, working directory, and hidden Windows command window. `kill_on_drop` terminates a child when the timeout drops its wait task. Nonzero exits preserve both output streams for diagnosis.

## Workspace refresh

Concurrent load/refresh callers for one workspace share requests. Background polling reuses fresh results: global interval 60 seconds and Update interval 30 seconds. Failures are never marked fresh.

Commit, Add, Revert, Stash, Update, and ignore-setting mutations require new scans rather than pre-mutation requests. Generations prevent superseded scans writing back.

Update polling follows activation/deactivation. Leaving a cached page clears timers; returning queries remote state. A completed update forces shared workspace refresh and invalidates old Update cache even when inactive, without continuing remote polling while inactive.

## Workspace and diff virtualization

Workspace files, inline diffs, standalone Diff, and its navigation sidebar share a fixed-height VirtualViewport. Only visible rows plus six buffered rows above/below are mounted. Spacer heights preserve continuous scrolling, ResizeObserver tracks size, and filtering/data changes reset or constrain scroll.

Selection is path-based, supports arrows/Home/End, and retains context menus/actions. Diff navigation scrolls to the selected file.

Both diff surfaces share DiffViewer. Raw text and Uint32Array offsets remain in the data layer; only visible rows get display objects, while statistics cover the full text. Over 200,000 UTF-16 code units, a worker builds indexes/searches. Replacing text or unmounting terminates old workers, and generations reject late replies.

Search is case-sensitive and supports cyclic previous/next, Ctrl/Cmd+F, Enter/Shift+Enter, and copying the entire diff. Unrendered lines remain searchable/copyable. Horizontal extent accounts for offscreen long lines, tabs, and wide characters; diffs do not wrap.

Commit-tree virtualization, default collapse, and selection-count optimization were deferred at user request; see [TODO](../todo.md).

## Validation

Run `npm run check` for frontend build/tests and Rust formatting/tests.

Regressions cover pagination cursors, navigation/filtering, empty/boundary pages, stale replies, ignore order/cache, shared refresh, retry, switching, post-mutation scans, large output, and timeout child termination. Virtualization covers large ranges, shrinking data, and resizing. Diff tests cover complete statistics, visible extraction, CRLF, empty/wide lines, and cyclic search.

Browser interaction uses mocked Tauri IPC to check actual worker filtering, row counts, no requests on scroll, previous-page cache, filtered pagination, and Update polling lifecycle. Measure real repositories/network separately in the desktop app.

Stress checks use 50,000 fictional files and 100,000 diff lines: mounted rows stay in the tens, end scrolling, offscreen search/full copy, long-line horizontal scrolling, keyboard/context actions, shrinking filters, resizing, dark theme, file navigation, and scroll reset. Production workers are also checked under desktop CSP.

## Persistent filesystem and SVN status cache

Windows XML status paths normalize to `/` for consistency with manifests/targeted paths, preventing stale entries after revert due to slash mismatches. Native snapshots upgraded to v6 in 0.6.3, invalidating older path formats and snapshots lacking ancestor administration state. Unix backslashes remain unchanged.

Native `workspace-status` cache stores paired manifests/raw SVN states by canonical working-copy path: five recent copies, 24-hour expiry, 64MiB snapshot maximum, and 500,000 manifest entries. Frontend snapshots show old content immediately; native cache validates it.

After restart or memory eviction, compare path, type, size, mtime, symlink target, and Unix ctime without reading file content, following symlinks, or traversing `.svn/pristine`/`.svn/tmp`. Unchanged filesystems reuse status; up to 256 ordinary changed paths use `svn status --xml --depth empty -- <paths>` and merge raw status. Sorted manifests merge linearly without repeated whole-path sets.

For working-copy subdirectories, find the nearest ancestor `.svn`/`_svn` and retain non-pristine/tmp metadata. Ordinary scans, Windows USN, and prewrite validation check this ancestor manifest. Changes to ancestor wc.db trigger a full query to detect external property/add/revert changes. Root workspaces use their own manifest.

Fall back to full scans for directory-structure, SVN metadata/configuration fingerprint changes; missing/expired/corrupt cache; unreliable metadata; excessive scope; or failed targeted commands. Manual/forced post-operation refresh remains complete. Configuration cache stores fingerprints, not contents.

Each scheduled refresh checks metadata in a blocking task against memory; reopening can restore a disk baseline. Reuse unchanged status, target ordinary changes, and perform a full check every five minutes. Recursive watchers/notify and the 25ms notification-coalescing wait were removed.

Manifests are contiguous sorted arrays. Unix also caches directory mtime/ctime/device/inode and direct-child indexes. Stable directory identity/times for at least one second permit index reuse without read_dir. Reenumerate only changed directories; parent changes detect deletions/cross-directory moves. With all directories unchanged, reuse sorting/indexes and check individual file metadata.

Windows uses DirEntry enumeration metadata instead of statting every cached path. Unix reenumerates for coarse second-resolution ctime, unstable timestamps, identity changes, or incremental failure. Five-minute/manual checks and background prewrite checks always enumerate fully. Cache reads validate index ranges, parent ownership, completeness, and order; corrupt indexes regenerate.

Traversal carries the administration-directory flag per directory instead of parsing every path component per file. Files still check their own mtime/size even when the parent is unchanged. Cache upgrades regenerate manifests once.

Full scans and changed targeted checks update memory and schedule disk snapshots. Capture the manifest before SVN; recapture in the background and atomically replace the disk snapshot only if stable. Revalidation/writing does not block display. Changes during this interval cancel the write; the next poll compares against the prequery baseline. Exiting before writing may restore an older baseline or require a full scan next time.

Real-SVN tests cover edits during shutdown, revert/rename/delete, ignored files, new directories, external properties, corrupt cache, Unix same-size preserved-mtime edits, and symlinks. Directory reuse tests add edits without enumeration, deletion after restoring parent mtime, cross-directory moves, nested additions/deletions, index corruption, coarse time, and identity changes. Reopening still traverses the filesystem; reduced SVN scope is not guaranteed faster than full SVN on every storage device.

### Historical benchmark before watcher removal 2026-09-30

Linux warm filesystem, standalone Release harness importing the same native source, SVN 1.14.3, 200 directories/20,000 files/40 edits: first full check plus persistence 282.1ms; after clearing memory, disk restore/40-path validation 211.4ms and unchanged restore 131.2ms; running targeted refresh 42.8ms and unchanged memory reuse 0.1ms. Standalone full SVN was 116.5ms without watcher/snapshot work. Reopening includes watcher setup, traversal, and JSON reads but excludes background updates, which finished before the next reopening. This did not establish that disk reopening beat a full query or solve all large-repository latency. Desktop WebView, cold storage, and real user repositories were not measured.

### After watcher removal

Comparable Release results: manifest traversal 49.0ms; running 40-path traversal/query 71.2ms; unchanged traversal/reuse 47.7ms; memory-cleared disk restore/40-path validation 84.9ms; unchanged restore 65.3ms; standalone full SVN 109.4ms; first full check/persistence 206.6ms. Assertions confirmed exactly 40 targeted paths for changes and Reuse for unchanged reopening, equivalent to full SVN. Foreground times exclude background revalidation/write, awaited before the next reopening. This single warm Linux measurement does not represent cold disks, Windows, complete desktop load, or fixed times for all repositories.

### After directory-index reuse

Comparable Release results: full enumeration 52.2ms; incremental manifest 38.2ms (zero enumerated/202 reused directories, 20,004 files/metadata checked); running 40-path check 60.2ms, unchanged 38.3ms; disk reopening with 40 edits 75.5ms, unchanged 58.4ms; standalone SVN 102.7ms; first full/persisted check 215.8ms. Directory times stabilized for one second before measuring. Foreground excludes background full reenumeration/write. Exactly 40 paths were validated and matched full SVN. Windows, cold storage, and full desktop startup remain unverified.

## Windows NTFS USN incremental queries

On local NTFS with journal-read permission, prefer USN. A full scan establishes volume GUID/serial, root ID, Journal ID, cursor, and file/parent-ID-to-path index, persisted in the snapshot. `FILE_ID_BOTH_DIR_INFO` bulk enumeration avoids opening every file. Directory/volume handles exist only during queries; no resident watcher, elevation request, journal creation, or journal modification.

Refresh/reopening reads V2 records after the saved cursor, pins an end cursor, and leaves newer records for next time. `ReturnOnlyOnClose=0` and `BytesToWaitFor=0` do not wait for close/future events. Edit/create/delete/rename records produce at most 256 candidate paths for targeted SVN. Reasons trigger checks even with unchanged size/mtime. The ID index retains every in-workspace hard-link path and validates known links after outside hard-link edits. DOS short-name data records reuse indexed paths rather than duplicate entries.

Fall back to full filesystem/SVN scans for directory create/delete/move, SVN metadata/config changes, root/volume identity mismatch, journal recreation/truncation, invalid cursors, unknown versions, parse failures, reparse points, or too many candidates. FAT/exFAT, network shares, unsupported volumes, and denied access use metadata fallback. Workspaces with reparse points disable USN. Replay is capped at 16MiB/two seconds to bound unrelated volume activity; exceeding it also falls back. Five-minute/manual checks remain full.

After targeted validation, update only candidate metadata/related parent manifests. If unrelated volume activity advances the cursor, persist a background checkpoint to avoid replay on reopening. Before writing, read subsequent records; relevant changes cancel persistence and retain the prequery cursor. Without journals, full snapshots retain before/after manifest consistency checks.

Linux regressions cover V2 alignment/UTF-16, malformed/unknown records, accumulated rename reasons, deletions, external hard links, short names, unrelated/close filtering, directory/metadata fallback, bounds, journal recreation/truncation, and out-of-range cursors. SVN integration tests still pass. Windows modules/tests pass x86_64-pc-windows-gnu cross-compilation, but Linux cannot execute NTFS runtime tests; actual permissions, hit rates, and timings remain unverified. Native Windows NTFS tests report skipped when unsupported. Set `ORCASVN_REQUIRE_USN_TEST=1` to require success.

References: [change journals](https://learn.microsoft.com/en-us/windows/win32/fileio/change-journals), [read parameters](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ns-winioctl-read_usn_journal_data_v0), [V2 records](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ns-winioctl-usn_record_v2), [bulk file IDs](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_both_dir_info).

## Comparison against stable v0.6.2

On 2026-10-08, Linux aarch64 Release/warm local 1,000/10,000-file copies compared v0.6.2 and c7dfd6b. At 10,000 files, native unchanged-refresh median fell from 100.7 to 20.4ms and cached reopening from 100.7 to 29.5ms; uncached first load improved only from 101.0 to 82.8ms. First load still performs full manifest/SVN checks; this is not a claim of comprehensive first-open acceleration. See [methodology, aggregates, and rerun instructions](workspace-startup-benchmark.md).
