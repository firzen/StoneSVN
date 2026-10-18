# StoneSVN user guide

English | [简体中文](user-guide.zh-CN.md)

Applies to the current 1.1.3 source. Updated: 2026-10-19. Older releases may have a different interface.

This guide covers checkout, reviewing changes, committing, updating, and browsing history for code, documents, and other SVN-managed files. No implementation knowledge is required.

## Contents

- [Getting started](#getting-started)
- [Interface overview](#interface-overview)
- [Manage workspaces](#manage-workspaces)
- [Understand file status](#understand-file-status)
- [Commit changes](#commit-changes)
- [Get remote updates](#get-remote-updates)
- [Compare changes](#compare-changes)
- [Browse commit history](#browse-commit-history)
- [Stash unfinished changes](#stash-unfinished-changes)
- [Trace file history](#trace-file-history)
- [Settings and display](#settings-and-display)
- [Troubleshooting](#troubleshooting)
- [Feature boundaries](#feature-boundaries)

## Getting started

### Prepare StoneSVN and SVN

StoneSVN requires a local SVN CLI. It does not replace an SVN server or create remote repositories.

1. Download the appropriate installer from [Releases](https://github.com/firzen/StoneSVN/releases).
2. Install the SVN CLI and verify that `svn --version --quiet` prints a version.
3. Start StoneSVN. If SVN is not found, set SVN Executable in Settings to the actual program, such as `C:\Tools\Subversion\bin\svn.exe`.

Specify an executable file rather than its installation directory. An empty setting uses system `svn`. Prepare the repository URL and required permissions before connecting. Use the SVN error to diagnose authentication or contact your repository administrator. There is no separate account-management page.

### Open an existing local project

Select Add Local Copy and choose an SVN working copy, normally the project root containing `.svn`, such as `D:\projects\eagle`. Opening a normal folder does not turn it into a working copy. Older versions call this action Open Workspace.

### Check out a project

Select Add Remote Copy to open Checkout:

| Field | Value |
| --- | --- |
| Repository URL | The team's address, such as `https://svn.example.com/repo/trunk`. |
| Destination | A dedicated local directory, preferably new. |
| Revision | Empty for the latest revision, or a historical revision number. |

Start checkout and wait for the result. On failure, read the error before checking the URL, permissions, network, and destination. Checkout retrieves files; opening a workspace uses files already checked out.

### Make your first commit

1. Open the workspace and obtain remote changes in Update.
2. Edit files in your editor.
3. Return to StoneSVN, refresh, and select files to inspect diffs.
4. Open Commit, verify the selected scope, and write a message.
5. Commit, then check remaining workspace changes.

For a change only to `trunk/app.ini`, select that file and describe the configuration fix. Leave unrelated unfinished edits local.

## Interface overview

The screenshots show the 1.1.2 Vue development interface with fictional data, captured at 1440 × 900 on 2026-10-18. Paths, revisions, and diffs are examples, not real repositories. They use the English locale, matching the instructions.

![Light workspace and diff](images/screenshots/en-workspace-light.png)

![The same workspace in dark theme](images/screenshots/en-workspace-dark.png)

| Area | Purpose |
| --- | --- |
| Project sidebar | Add local/remote copies and switch working copies. |
| Top toolbar | Workspace, Timeline, Properties, Update, Commit, Stash, Trace, Refresh, Open With, Settings, and language. |
| Status list | Filter local file states and select a diff. |
| Diff panel | Review changes and addition/deletion counts. |
| Status bar | Identify the current workspace and related status. |

In narrow windows, navigation can scroll horizontally and file/diff panels stack vertically. Selected files use background highlighting; keyboard-focused controls have a separate focus indicator.

## Manage workspaces

Switch between added paths in the project sidebar. Confirm the directory first, particularly when one repository has multiple working copies. Local edits do not synchronize between working copies; committed content becomes available through Update.

Open With provides file-manager, VS Code, and terminal actions when those programs are installed. File context menus can reveal files or copy relative/absolute paths.

### Refresh and cached status

Refresh checks the local working copy; it neither updates remote changes nor commits.

Reopening may display a saved file list before checking the actual disk state. A cached/unverified notice means the list may be stale. Commit, stash creation, and workspace revert/delete are temporarily unavailable. Wait or refresh. If validation fails, address the error rather than trusting the old list.

Working-copy subdirectories are supported; validation also checks their parent SVN administration metadata. The 0.6.3 native cache-format upgrade requires rebuilding old caches once and may cause an initial full scan.

Loading cost depends on file count, disk, antivirus, and filesystem state. Repository history length and local status checking are separate factors.

## Understand file status

| Status | Meaning | Next step |
| --- | --- | --- |
| Modified | Local edits to a versioned file | Review, then commit, stash, or revert. |
| Added | Scheduled addition, not yet committed | Confirm it belongs in the repository and commit. |
| Deleted | Scheduled deletion, not yet committed | Check the scope, then commit or revert. |
| Replaced | An original entry has been replaced | Review the complete operation. |
| Unversioned | Present locally but not versioned | Add before committing, or keep local. |
| Conflicted | Automatic reconciliation failed | Use Resolve Conflicts in the list or Properties. |
| Missing | A versioned item is absent from disk | Restore it or schedule versioned deletion. |
| Obstructed | A filesystem item blocks SVN | Read the error and inspect path, item type, and working-copy state. |

Changes groups modified, added, deleted, and replaced entries. Unversioned is separate. The workspace is not an all-files browser; unchanged files may be absent.

### Revert versioned files

Select Revert on the file row, read the warning and full path, then confirm. This discards local changes, not committed history. Save a supported stash or independent backup first if needed.

### Delete unversioned files

Delete permanently removes the local target and directory contents without using the recycle bin. It is different from committing a versioned deletion. Check the path. Cancel or Close exits; clicking the overlay does not dismiss the confirmation.

## Commit changes

Commit sends selected local changes to the repository and creates a revision. Ordinary unselected edits remain local.

Write the message at the top; Recent Commit Messages can refill previous text. The tree lists files, states, and relative locations. Hover over short status marks for their meaning. The bottom action area stays fixed while the file list scrolls.

The header checkbox selects or clears the entire current scope, including items hidden by search or filters. Selected/Total shows the count, and a bottom notice identifies hidden selections. Scrolling and collapsing nodes do not deselect them.

With a file row focused, Up/Down moves, Home/End jumps, Left/Right collapses, expands, or returns to the parent, and Space toggles selection.

### Choose the scope

1. Check the working-copy path and file tree.
2. Select files and directories deliberately. Use Include Descendants for a complete directory scope; expanding nodes or selecting Diff does not change selection.
3. Search/filter as needed, while checking the selected count.
4. Review diffs, then recheck selections and the message.
5. Commit.

Hidden selected files remain included. Use the actual selected count and scope rather than only the visible list.

### New files and directories

Add unversioned items first. Use Add to Version Control and Preview for directories, inspect their contents, then commit. Adding schedules the change; it does not upload it. Cancelling a commit may leave Added status.

### Directory limitations

Deleted/replaced directories require all related descendants. Copied directories do not support partial commits, and moved directories require the source, destination, and related changes. Follow the scope warning or use another SVN client for the complete operation.

### Commit messages

Explain what changed and why:

```text
Correct the default connection timeout

Use the team-agreed value to avoid timing out the first connection too early.
```

Adapt reused messages. After failure, retain the error and refresh to check the actual result rather than assuming complete success or no changes.

## Get remote updates

An update can continue after you change pages. Completion refreshes the shared local revision and status. Leaving Update pauses automatic remote polling; returning resumes it.

The page shows local/remote revisions, listed remote commits, and local edits.

1. Select Check and review remote commits and local changes.
2. Back up or stash supported unfinished work when needed.
3. Select Update and wait.
4. Check the workspace for conflicts and remaining edits.

The remote commit count refers to the currently listed records, not the entire history. Update may merge local edits or produce conflicts; it does not commit local work.

## Compare changes

Select a file for inline preview or use the diff page to choose a file inside the workspace.

| Mode | Comparison |
| --- | --- |
| Working copy vs base | Local content against the SVN working-copy base. |
| Between revisions | The same target at two explicitly supplied revisions. |
| Commit rN | The changes in a commit opened from its history details. |

Added lines have `+`; removed lines have `-`. Context helps locate the edit. Search is case-sensitive with previous/next navigation; Copy copies the full diff. Distinguish no differences from a load failure.

When reviewing several files from Commit, use Previous/Next and Return to Commit. Binary content may not provide a line-by-line text diff.

## Browse commit history

Timeline shows 20 commits per page. Use Previous/Next, combine author/keyword/date conditions, then Query; Reset clears them.

Records show revision, author, date, and message. Hover over truncated fields for full text. Open a record for its full message and changed paths, then choose a file for the commit diff.

If no records match, check filters or reset. Uncommitted edits appear in the workspace rather than the timeline.

## Stash unfinished changes

Stashes interrupt and resume a task. They are stored locally by working-copy path, not committed or shared with teammates.

### Create

1. Open Stash and select Create Stash.
2. Review text diffs and select files or hunks.
3. Select unversioned files/directories as whole files.
4. Enter a recognizable name.
5. Select Save and Remove from Working Copy.

Selected changes are removed after saving; unselected edits remain. Restored unversioned files stay unversioned. Conflicted versioned content, property-only changes, and non-text versioned changes are not supported by this flow; follow the actual preview.

### Restore and manage

| Action | Result |
| --- | --- |
| Apply | Restore to the original workspace, retaining the record. |
| Pop and Delete | Delete the record after successful application. |
| Delete | Delete only the record, leaving the working copy unchanged. |
| Copy/export patch | Export only the text-patch portion. |

Patch exports omit separately stored unversioned file content. A stash containing only unversioned files may have no exportable text patch. Back up those files separately when moving or preserving them.

If saving succeeds but removing local edits fails, the record is retained: refresh and inspect remaining changes. After application failure, inspect before retrying. Clearing application data may erase stashes; commit important work or keep independent backups.

## Trace file history

Choose or enter a file in Trace and load its revisions, authors, dates, and messages. Open a revision's diff to understand its changes. The current interface provides file commit history, not line-by-line annotations. Use `svn blame` or another supporting client for each line's last revision/author. Use workspace diffs for uncommitted edits.

## Settings and display

| Setting | Meaning |
| --- | --- |
| Language | Simplified/Traditional Chinese, English, Japanese, Korean; also accessible from the toolbar. |
| Theme | Light, Dark, or System. |
| SVN executable | Empty for system `svn`, or an actual executable path. |
| Remembered servers | Inspect/remove saved TLS or certificate exceptions. |
| Default encoding | UTF-8, GBK, or GB2312 for decoding; does not rewrite file encodings. |
| File filtering | Global rules, one per line, disabled by default; initial rule is `.gitignore`. |

Filtering reads Settings rules, not `.gitignore` content. The initial rule hides that file itself. Enabled matches are omitted from changes and commit candidates; disable to reveal them. Rules are local across workspaces and do not alter SVN ignore properties, versioning, or updates.

- A name without `/` matches at any depth, for example `.gitignore`, `*.log`, or `temp?.txt`.
- Paths containing `/` match from the workspace root; the leading slash is optional. `/_tmp1010/log*` equals `_tmp1010/log*`, but does not match `other/_tmp1010/log`.
- `*` stays within a directory, `?` matches one non-separator, and `**` spans directories. `/_tmp1010/**/log` includes zero or more intermediate directories.
- A matched directory includes descendants. `/_tmp1010/log/*` filters direct children and their descendants but retains `log`; `/_tmp1010/log` filters the directory too. Complete path segments prevent `log` from matching `logger`.
- Any matching rule filters the item. `!` negation is unsupported; `!`, `#`, and brackets are literal characters. Blank lines and surrounding whitespace are ignored. `..` cannot escape the workspace.

Add and Commit recheck rules. A recursive add containing filtered items is blocked before adding and identifies the path. Directory deletion, replacement, copy, or move is blocked when its required scope cannot be safely split. Other SVN clients do not read these rules.

There is no need to preconfigure server compatibility. A TLS handshake failure can prompt for legacy TLS compatibility for the displayed host and port. Certificate validation failure prompts separately for trusting an invalid certificate. Confirmation retries the connection; cancelling retains the error. Authentication failure does not trigger either prompt.

Legacy TLS and expired, self-signed, or mismatched certificate exceptions reduce connection security. Confirm only for trusted servers. Decisions are saved per host/port and restored after restart; remove them from Remembered Servers to revalidate. Previous manual settings migrate automatically.

TLS compatibility uses [OpenSSL process configuration](https://docs.openssl.org/3.5/man5/config/) and requires an OpenSSL-based SVN. Trusting a certificate alone does not lower the TLS security level. Configuration is passed only to matching SVN processes, does not rewrite system configuration, and does not replace authentication. Commit, Checkout, Switch, and Merge perform a read-only connection check first; mutation commands are not automatically repeated after TLS prompts. Replace an older compatibility launcher with the normal `svn` path if needed.

Reduced-motion system preferences reduce animation while preserving loading text. Workspace controls support Tab, arrow keys, Home/End, and Enter on the focused action. This guide does not promise additional global shortcuts.

## Troubleshooting

| Problem | Action |
| --- | --- |
| SVN not found | Verify it in the terminal, check the executable path, and restart after environment changes. |
| Not a working copy | Choose the `.svn` working-copy root or check out first. |
| Commit/Stash/Revert unavailable | Check cached validation, in-progress operations, and applicable selection. |
| New file absent from Changes | Look in Unversioned and add it before committing. |
| Missing list entries | Check status filters and file filtering, then refresh; unchanged files may be omitted. |
| Update conflict | Review content, resolve conflicts, mark resolved, and refresh. |
| Working copy locked | If no SVN command is active, use Cleanup; follow persistent SVN errors. |
| Authentication/certificate/network error | Check URL, access, network, and team certificates; retain the original error. |
| Stash not visible | Return to the creation path; records do not automatically follow moved workspaces. |
| Garbled text | Check file/default encoding; do not revert to fix display decoding. |
| Recover after delete/revert | Uncommitted work may not be recoverable through SVN; check backups/editor history. |

Reports should include version, OS, steps, expected/actual results, and the full error, with screenshots if useful. Remove credentials and sensitive URLs/content before sharing. Report through [Issues](https://github.com/firzen/StoneSVN/issues).

## Feature boundaries

Properties supports versioned rename/move, scheduled deletion, and recursive revert. Move targets are complete workspace-relative paths whose parents are already versioned. Review and commit renames/moves separately. Revert Local Changes discards descendant content, properties, and scheduled changes; uncommitted work may be permanently lost.

Resolve Conflicts is available from the workspace or Properties. Keep Current Content clears status after you manually edit and remove markers. Local/repository choices replace the complete file and conflicted properties. Organize directory/tree conflicts first, then mark resolved. Review and commit afterward.

Relocate Repository URL handles a full address change for the same repository. SVN validates repository identity. It neither switches branches nor relocates external working copies automatically. Switch and general-purpose Merge require another client or CLI.

SVN base content, local edits, and repository history are different layers: Refresh checks local state, Update retrieves remote content, Commit sends local changes, Revert discards local edits, and Stash saves work locally. Confirm the intended layer before acting.

For an abbreviated walkthrough, see [Quick start](../QUICKSTART.md).
