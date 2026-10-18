# Workspace loading benchmarks

English | [简体中文](workspace-startup-benchmark.zh-CN.md)

## Version 0.6.3 versus 0.6.2 2026-10-08

Comparison: `v0.6.2` (`2c097dd`) against `c7dfd6b`, the final functional commit before 0.6.3. Environment: Linux aarch64, SVN 1.14.3, Rust 1.97.1, standalone native harness built in optimized Release mode. Clean working copies checked out from local repositories contain 1,000/10,000 small text files, 100 per directory. Filesystem caches are warm; these are not cold-storage or remote-repository measurements.

Each scenario had three warmups and 15 measured runs; values are medians. Versions ran sequentially rather than in randomized alternation, so environmental variation remains. Every result was compared with full `svn status`. Timings include the local revision query. First load also queries repository metadata in parallel; other scenarios assume frontend repository metadata is already cached.

| Files | Scenario | v0.6.2 median ms | 0.6.3 median ms | Time reduction |
| ---: | --- | ---: | ---: | ---: |
| 1,000 | First load without application cache | 101.2 | 22.3 | 78% |
| 1,000 | Cached reopening | 100.8 | 11.7 | 88% |
| 1,000 | Unchanged refresh | 100.8 | 13.1 | 87% |
| 10,000 | First load without application cache | 101.0 | 82.8 | 18% |
| 10,000 | Cached reopening | 100.7 | 29.5 | 71% |
| 10,000 | Unchanged refresh | 100.7 | 20.4 | 80% |

Without application cache, each run clears native memory and uses a new disk-cache location; 0.6.3 performs full manifest/SVN checks. Cached reopening clears memory and restores a persisted snapshot; 0.6.2 has no native disk status cache and still requests full SVN status. Unchanged refresh retains native memory; both versions query the local revision. Timings exclude harness process creation, Tauri IPC, WebView startup, localStorage restoration, Vue rendering, and ignore matching. Background 0.6.3 revalidation/writes finish before the next run but are excluded from foreground time.

Status-only medians were 100.7 → 2.0 ms for 1,000 files and 100.7 → 20.1 ms for 10,000 files. These exclude local revision queries and desktop startup.

Most improvement comes from status reuse and asynchronous process waiting, removing 100ms completion polling. The 10,000-file first load remains constrained by full manifest/SVN scans. These results establish neither equal gains on Windows/cold disks/all repositories nor frame rates for log/diff virtualization.

Machine-readable scenarios, P95, and commit IDs are in [v0.6.3-performance-summary.json](benchmarks/v0.6.3-performance-summary.json). This contains aggregates, not individual raw samples.

Rerun from the repository root:

```bash
python3 scripts/benchmark-workspace-comparison.py --baseline v0.6.2 --candidate v0.6.3 --files 1000 10000 --output /tmp/orcasvn-performance.json
```

The Linux script requires Python 3, Git, Cargo, svn, and svnadmin. It imports SVN modules from the specified commits, creates temporary harnesses/working copies, and builds Release with dependencies locked by `docs/benchmarks/workspace-comparison.Cargo.lock`. The first run downloads Rust dependencies. Temporary copies are removed afterward; repository source and user copies are untouched. Build/data-preparation time is excluded. Recheck methods/results after environment or source-interface changes.

## Historical Windows measurements 2026-10-01

These earlier-machine records use development code from that time, not the 0.6.2/0.6.3 comparison; do not compare them directly with the table above.

Working copy: `D:/eagle`. Windows 11 10.0.26200, AMD Ryzen 7 8845H, NTFS D drive, SVN 1.14.5, optimized Release development build including Windows status-path fixes. The manifest has 13 entries including directories/SVN metadata; status has three changed entries. The process lacked USN volume-read permission and used metadata-scan fallback.

## Measurement scope

Measure startup-restoration native requests: status and local revision run concurrently; uncached runs also query repository metadata. Each run clears native memory and uses isolated temporary disk cache, without changing working-copy content, existing application cache, or settings. Compare every result to full SVN status and assert Full without cache and Reuse on disk restoration.

Uncached means no application cache; the filesystem is warm, not cold after reboot. Timings include SVN subprocess creation but exclude OrcaSVN process creation, WebView startup, Tauri IPC, frontend localStorage/filtering/Vue work, and background snapshot writes. Disk-cache scenarios assume frontend repository metadata exists. These are not icon-click-to-interactive timings.

## Final measured group

Seven runs per scenario. Two earlier repeat groups had total medians of 57.1/52.8 ms uncached and 42.3/44.3 ms disk-cached. The final group below followed termination of concurrent synthetic-repository preparation.

| Run | Uncached status ms | Uncached total ms | Disk status ms | Disk revision ms | Disk total ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 60.4 | 60.5 | 5.8 | 39.0 | 39.0 |
| 2 | 54.9 | 54.9 | 6.7 | 48.1 | 48.1 |
| 3 | 52.8 | 52.8 | 9.9 | 56.6 | 56.7 |
| 4 | 58.2 | 58.2 | 7.2 | 52.2 | 52.2 |
| 5 | 59.6 | 59.6 | 7.0 | 49.9 | 49.9 |
| 6 | 57.8 | 57.8 | 6.9 | 48.2 | 48.2 |
| 7 | 58.9 | 58.9 | 7.0 | 46.5 | 46.5 |

| Scenario | Minimum total ms | Median ms | Maximum ms |
| --- | ---: | ---: | ---: |
| Uncached load | 52.8 | 58.2 | 60.5 |
| Disk-cache restoration | 39.0 | 48.2 | 56.7 |

Cached status had a 7.0ms median; the local revision request had a 48.1ms median. This copy's native data phase mostly waits for `svn info --show-item revision`. It does not explain total perceived startup or represent large copies.

## Rerun

From the root in PowerShell:

```powershell
$env:ORCASVN_BENCH_WORKSPACE = 'D:/eagle'
cargo test --release --manifest-path src-tauri/Cargo.toml benchmark_workspace_startup -- --ignored --nocapture
```

This ignored benchmark runs explicitly; ordinary regression tests do not access user copies. Temporary cache is removed afterward. Concurrent working-copy edits may fail consistency assertions; stabilize the copy before rerunning.

At that time, Release regressions had 56 passes and two ignored benchmarks. Native USN returned early on access denied; this is not USN fast-path validation.

The original 20,000-file synthetic setup waited over four minutes at its first commit and was terminated/cleaned up. It produced no valid benchmark; preparation time is excluded.

## Synthetic working copies

On the same day/machine, separate real local repositories and working copies were created. All were clean, Release builds, metadata fallback, seven runs per scenario with the same timing boundaries.

| Versioned files | Commits | Uncached median ms | Disk restoration median ms |
| ---: | ---: | ---: | ---: |
| 1,000 | 200 | 59.6 | 51.3 |
| 10,000 | 1,000 | 112.4 | 46.7 |
| 10,000 | 10,000 | 109.3 | 43.1 |

These sequential samples are not a controlled simultaneous comparison and do not establish that more history accelerates loading. Small text files of a few hundred bytes do not represent large binaries, complex externals, many unversioned files, cold disks, or network drives.

Working copies:

- `D:/OrcaSVN-bench-1000-200/wc`: 1,000 files/200 commits.
- `D:/OrcaSVN-bench-10000-1000/wc`: 10,000 files, extended from 1,000 to 10,000 commits; the original directory name was retained.

Final checks confirmed continuous r1–r10000, changed paths in every commit, 10,000 versioned files, and a clean copy. Each directory's `manifest.json` records final size; `startup-benchmark.log` contains the initial run and `startup-benchmark-r10000.log` the extended-history result. These local files are not tracked in Git.

## Standalone svn status

On the final clean 10,000-file/10,000-commit copy, PowerShell sequentially ran `svn status --xml` ten times, discarding XML. Timings include subprocess creation/output reception:

| Metric | ms |
| --- | ---: |
| Minimum | 59.6 |
| Median | 63.35 |
| Maximum | 69.5 |

Samples: `63.6, 65.0, 59.6, 63.1, 61.8, 60.4, 64.5, 62.1, 69.5, 67.0` ms. This describes this machine's warm-cache scenario only. Startup-data benchmarks additionally include manifest/cache handling and concurrent metadata requests, so their totals are not standalone `svn status` timings.

Open `wc`, not `repo`, in OrcaSVN when measuring or checking pagination. Log pages contain 20 entries; 10,000 commits support repeated navigation/filter tests, but this report measures neither log-query time nor rendering.
