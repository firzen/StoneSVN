Sharing StoneSVN, an MIT-licensed SVN desktop client for Windows, macOS and Linux, developed from OrcaSVN. Its Tauri frontend delegates SVN operations to a Rust backend that uses Tokio to run the separately installed SVN CLI.

The relevant part for this community is the child-process boundary:

- `tokio::process::Command` receives the executable and argument list directly, without a shell command string.
- `stdout` and `stderr` are piped, and `Command::output()` collects both. This is buffered collection, not a streaming log UI or a memory-bounded output pipeline.
- `tokio::time::timeout` bounds each operation. `kill_on_drop(true)` is set before execution so dropping a timed-out output future does not intentionally leave its direct child running. This does not claim full descendant-process-tree cleanup.
- Unix child processes receive a UTF-8 locale independently of the desktop launch environment; Windows uses `CREATE_NO_WINDOW` for the CLI subprocess.
- Source tests cover draining large stdout/stderr and direct-child termination after a timeout. I am linking those tests, not presenting a new cross-platform installation or benchmark result.

[Executor and tests](https://github.com/firzen/StoneSVN/blob/main/src-tauri/src/svn/executor.rs) · [Project source](https://github.com/firzen/StoneSVN) · [Screenshots and installers](https://stonesvn.github.io/en/)

The app focuses on multiple working copies, diff review, selective commits and local stashes of selected text changes. General Merge, Switch and line-level Blame interfaces are not currently available.

Feedback on the process ownership and cancellation boundary would be useful to this project and to other desktop applications wrapping an existing CLI. Self-submission; this introduction was prepared with AI assistance.
