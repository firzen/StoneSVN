use super::executor::{execute_svn, SvnError};
use super::operations::info;
use super::parser::{parse_incoming_status_xml, parse_log_xml};
use crate::SvnLogEntry;

fn url_for_path(base: &str, relative: &str) -> Result<String, SvnError> {
    let mut url = tauri::Url::parse(base).map_err(|e| SvnError::ParseError(e.to_string()))?;
    let mut segments = url
        .path_segments_mut()
        .map_err(|_| SvnError::ParseError("Invalid SVN URL".into()))?;
    segments.pop_if_empty();
    for segment in relative.split('/').filter(|s| !s.is_empty() && *s != ".") {
        segments.push(segment);
    }
    drop(segments);
    Ok(url.to_string())
}

fn affects_pending(changed: &str, action: &str, pending: &str, subtree: bool) -> bool {
    changed == pending
        || (subtree && changed.starts_with(&format!("{pending}/")))
        || (matches!(action, "A" | "D" | "R") && pending.starts_with(&format!("{changed}/")))
}

fn needs_url_history_target(relative: &str) -> bool {
    relative
        .rsplit('/')
        .next()
        .unwrap_or(relative)
        .rsplit_once('@')
        .is_some_and(|(path, _)| path.ends_with([' ', '.']))
}

struct IncomingPath {
    url: String,
    base: u64,
    subtree: bool,
    root_url: String,
    relative: String,
}

#[derive(serde::Serialize)]
pub struct IncomingState {
    pub revision: u64,
    pub logs: Vec<SvnLogEntry>,
}

pub async fn incoming_logs(path: &str, limit: u32) -> Result<Vec<SvnLogEntry>, SvnError> {
    Ok(incoming_state(path, limit).await?.logs)
}

/// Compare repository state with each node's BASE, never the root revision alone.
pub async fn incoming_state(path: &str, limit: u32) -> Result<IncomingState, SvnError> {
    let xml = execute_svn(
        &[
            "status",
            "--xml",
            "--show-updates",
            "--verbose",
            "--ignore-externals",
            "--",
            ".",
        ],
        Some(path),
    )
    .await?;
    let (head, entries) = parse_incoming_status_xml(&xml)?;
    if !entries.iter().any(|entry| entry.incoming) {
        return Ok(IncomingState {
            revision: head,
            logs: Vec::new(),
        });
    }
    let workspace = info(path).await?;
    let mut roots = vec![(String::new(), workspace.url.clone())];
    for entry in entries.iter().filter(|entry| entry.switched) {
        let target = super::operations::normalize_svn_target(&entry.path);
        let xml = execute_svn(&["info", "--xml", "--", &target], Some(path)).await?;
        roots.push((entry.path.clone(), super::parser::parse_info_xml(&xml)?.url));
    }
    roots.sort_by_key(|(path, _)| std::cmp::Reverse(path.len()));
    let mut pending = Vec::new();
    for entry in entries.iter().filter(|entry| entry.incoming) {
        let (root, url) = roots
            .iter()
            .find(|(root, _)| {
                root.is_empty()
                    || entry.path == *root
                    || entry.path.starts_with(&format!("{root}/"))
            })
            .unwrap();
        let relative = entry
            .path
            .strip_prefix(root)
            .unwrap()
            .trim_start_matches('/');
        pending.push(IncomingPath {
            url: url_for_path(url, relative)?,
            base: entry.base,
            subtree: entry.subtree,
            root_url: url.clone(),
            relative: relative.to_string(),
        });
    }
    let mut result = Vec::new();
    // Query the working-copy URLs, rather than requiring access to logs for
    // the repository root. Include switched subtrees under their actual URLs.
    let mut queries = Vec::new();
    let mut query_urls: Vec<_> = roots.into_iter().map(|(_, url)| url).collect();
    query_urls.sort();
    query_urls.dedup();
    for query_url in query_urls {
        let scoped: Vec<_> = pending
            .iter()
            .filter(|node| node.root_url == query_url)
            .collect();
        let existing: Vec<_> = scoped
            .iter()
            .copied()
            .filter(|node| node.base > 0)
            .collect();
        if !existing.is_empty() {
            queries.push((query_url.clone(), Vec::new(), existing));
        }
        let mut missing = Vec::new();
        for node in scoped.into_iter().filter(|node| node.base == 0) {
            // SVN canonicalizes the part before the last @ as a local path,
            // even for relative log targets. On Windows that trims spaces or
            // dots before @. Use the escaped full URL for these special names.
            if needs_url_history_target(&node.relative) {
                queries.push((node.url.clone(), Vec::new(), vec![node]));
            } else {
                missing.push(node);
            }
        }
        for batch in missing.chunks(64) {
            // SVN accepts multiple relative paths below one URL. Batch missing
            // nodes so a large incoming addition needs one history walk rather
            // than a separate network round trip for every file. Keep their
            // history independent of existing nodes' BASE revisions.
            let mut targets: Vec<_> = batch
                .iter()
                .map(|node| {
                    if node.relative.is_empty() {
                        ".".to_string()
                    } else {
                        node.relative.clone()
                    }
                })
                .collect();
            targets.sort();
            targets.dedup();
            queries.push((query_url.clone(), targets, batch.to_vec()));
        }
    }
    for (query_url, targets, mut scoped) in queries {
        let Some(min_base) = scoped.iter().map(|node| node.base).min() else {
            continue;
        };
        let mut start = head;
        let mut found = 0;
        // Filter before applying the display limit, so newer local commits
        // cannot hide older incoming changes. Pin pages to the status HEAD.
        while start > min_base && found < limit.max(1) {
            let range = format!("{start}:{}", min_base + 1);
            let target = format!("{query_url}@{head}");
            let mut args = vec![
                "log",
                "--xml",
                "--verbose",
                "--limit",
                "100",
                "-r",
                &range,
                "--",
                &target,
            ];
            args.extend(targets.iter().map(String::as_str));
            let xml = execute_svn(&args, Some(path)).await?;
            let logs = parse_log_xml(&xml)?;
            if logs.is_empty() {
                break;
            }
            let mut exhausted = logs.len() < 100;
            start = logs.last().unwrap().revision.saturating_sub(1);
            for log in logs {
                let mut incoming = false;
                for changed in &log.changed_paths {
                    let url = url_for_path(&workspace.repository_root, &changed.path)?;
                    exhausted |=
                        changed.action == "A" && affects_pending(&url, "A", &query_url, false);
                    incoming |= scoped.iter().any(|node| {
                        log.revision > node.base
                            && affects_pending(&url, &changed.action, &node.url, node.subtree)
                    });
                    if !targets.is_empty() && matches!(changed.action.as_str(), "A" | "R") {
                        // Each missing node has its own creation boundary. An
                        // earlier incarnation of that path is not incoming.
                        scoped.retain(|node| !affects_pending(&url, "A", &node.url, false));
                    }
                }
                exhausted |= scoped.is_empty();
                if incoming {
                    result.push(log);
                    found += 1;
                    if found >= limit.max(1) {
                        break;
                    }
                }
            }
            if exhausted {
                break;
            }
        }
    }
    result.sort_by_key(|entry| std::cmp::Reverse(entry.revision));
    result.dedup_by_key(|entry| entry.revision);
    result.truncate(limit.max(1) as usize);
    Ok(IncomingState {
        revision: head,
        logs: result,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn relative_history_targets_preserve_names_before_at() {
        for path in ["another @ file.txt", "dir/name.@file.txt", "dir/a @name"] {
            assert!(needs_url_history_target(path), "{path}");
        }
        for path in [
            "normal.txt",
            "文件 0@%.txt",
            "dir @name/file.txt",
            "a@b.txt",
        ] {
            assert!(!needs_url_history_target(path), "{path}");
        }
    }

    #[test]
    fn incoming_logs_follow_each_nodes_base_revision() {
        let directory = std::env::temp_dir().join(format!(
            "stonesvn-incoming-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let repository = directory.join("repo");
        let wc = directory.join("wc");
        let other = directory.join("other");
        let created = Command::new("svnadmin")
            .arg("create")
            .arg(&repository)
            .output()
            .expect("svnadmin is required");
        assert!(created.status.success());
        let url = tauri::Url::from_file_path(&repository).unwrap().to_string();
        let run = |cwd: &std::path::Path, args: &[&str]| {
            let output = Command::new("svn")
                .current_dir(cwd)
                .args(args)
                .output()
                .expect("svn is required");
            assert!(
                output.status.success(),
                "{:?}: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
        };
        run(&directory, &["checkout", &url, "wc"]);
        for name in ["自己.txt", "远端@文件.txt", "remove.txt", "props.txt"] {
            std::fs::write(wc.join(name), "base\n").unwrap();
        }
        run(&wc, &["add", "--force", "--", "."]);
        run(&wc, &["commit", "-m", "initial"]);
        run(&wc, &["update"]);
        run(&directory, &["checkout", &url, "other"]);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            std::fs::write(wc.join("自己.txt"), "own commit\n").unwrap();
            run(&wc, &["commit", "-m", "own"]); // r2, root still r1
            assert_eq!(info(wc.to_str().unwrap()).await.unwrap().revision, 1);
            assert!(incoming_logs(wc.to_str().unwrap(), 50)
                .await
                .unwrap()
                .is_empty());

            // The same author on a second working copy must still be detected.
            std::fs::write(other.join("远端@文件.txt"), "remote\n").unwrap();
            run(&other, &["commit", "-m", "remote"]); // r3
            std::fs::write(wc.join("自己.txt"), "newer own commit\n").unwrap();
            run(&wc, &["commit", "-m", "own again"]); // r4
            let logs = incoming_logs(wc.to_str().unwrap(), 1).await.unwrap();
            assert_eq!(logs.iter().map(|l| l.revision).collect::<Vec<_>>(), vec![3]);

            run(&other, &["delete", "remove.txt"]);
            run(&other, &["commit", "-m", "delete"]); // r5
            std::fs::create_dir(other.join("新目录@test")).unwrap();
            std::fs::write(other.join("新目录@test/new.txt"), "new\n").unwrap();
            run(&other, &["add", "新目录@test@"]);
            run(&other, &["commit", "-m", "add"]); // r6
            run(&other, &["propset", "test:incoming", "yes", "props.txt"]);
            run(&other, &["commit", "-m", "property"]); // r7
            std::fs::write(wc.join("props.txt"), "local uncommitted\n").unwrap();
            let logs = incoming_logs(wc.to_str().unwrap(), 50).await.unwrap();
            assert_eq!(
                logs.iter().map(|l| l.revision).collect::<Vec<_>>(),
                vec![7, 6, 5, 3]
            );
            run(&wc, &["update"]);
            assert!(incoming_logs(wc.to_str().unwrap(), 50)
                .await
                .unwrap()
                .is_empty());
            assert_eq!(
                std::fs::read_to_string(wc.join("props.txt")).unwrap(),
                "local uncommitted\n"
            );

            // A newer root revision must not hide an older incoming file.
            std::fs::write(other.join("远端@文件.txt"), "remote again\n").unwrap();
            run(&other, &["commit", "-m", "remote again"]); // r8
            run(&wc, &["update", "--depth", "empty", "."]);
            run(&wc, &["propset", "test:root", "yes", "."]);
            run(&wc, &["commit", "--depth", "empty", ".", "-m", "own root"]); // r9
            assert_eq!(info(wc.to_str().unwrap()).await.unwrap().revision, 9);
            let logs = incoming_logs(wc.to_str().unwrap(), 50).await.unwrap();
            assert_eq!(logs.iter().map(|l| l.revision).collect::<Vec<_>>(), vec![8]);

            // Switched subtrees must use their effective repository paths.
            run(&other, &["update"]);
            std::fs::create_dir(other.join("dir")).unwrap();
            std::fs::write(other.join("dir/nested.txt"), "base\n").unwrap();
            run(&other, &["add", "dir"]);
            run(&other, &["commit", "-m", "directory"]); // r10
            run(
                &other,
                &[
                    "copy",
                    &format!("{url}/dir"),
                    &format!("{url}/branch"),
                    "-m",
                    "branch",
                ],
            ); // r11
            run(&wc, &["update"]);
            run(&wc, &["switch", &format!("{url}/branch"), "dir"]);
            run(&other, &["update"]);
            std::fs::write(other.join("branch/nested.txt"), "remote switched\n").unwrap();
            run(&other, &["commit", "-m", "switched change"]); // r12
            let logs = incoming_logs(wc.to_str().unwrap(), 50).await.unwrap();
            assert_eq!(
                logs.iter().map(|l| l.revision).collect::<Vec<_>>(),
                vec![12]
            );
            run(&wc, &["update"]);
            assert!(incoming_logs(wc.to_str().unwrap(), 50)
                .await
                .unwrap()
                .is_empty());

            // Batch multiple new paths, including nested directories, URL
            // escapes, and enough files to require a second bounded batch.
            run(&other, &["update"]);
            std::fs::create_dir(other.join("新增 @% directory")).unwrap();
            for index in 0..70 {
                std::fs::write(
                    other.join(format!("新增 @% directory/文件 {index}@%.txt")),
                    "new\n",
                )
                .unwrap();
            }
            run(&other, &["add", "--force", "--", "."]);
            run(&other, &["commit", "-m", "many incoming additions"]); // r13
            std::fs::write(other.join("another @ file.txt"), "new\n").unwrap();
            run(&other, &["add", "--force", "--", "."]);
            run(&other, &["commit", "-m", "another incoming addition"]); // r14
            let logs = incoming_logs(wc.to_str().unwrap(), 50).await.unwrap();
            assert_eq!(
                logs.iter().map(|l| l.revision).collect::<Vec<_>>(),
                vec![14, 13]
            );
            let logs = incoming_logs(wc.to_str().unwrap(), 1).await.unwrap();
            assert_eq!(
                logs.iter().map(|l| l.revision).collect::<Vec<_>>(),
                vec![14]
            );
            run(&wc, &["update"]);
            assert!(incoming_logs(wc.to_str().unwrap(), 50)
                .await
                .unwrap()
                .is_empty());
        });
        std::fs::remove_dir_all(directory).unwrap();
    }
}
