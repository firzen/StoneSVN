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

/// Compare repository state with each node's BASE, never the root revision alone.
pub async fn incoming_logs(path: &str, limit: u32) -> Result<Vec<SvnLogEntry>, SvnError> {
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
        return Ok(Vec::new());
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
        pending.push((url_for_path(url, relative)?, entry.base, entry.subtree));
    }
    let mut result = Vec::new();
    // Query the working-copy URLs, rather than requiring access to logs for
    // the repository root. Include switched subtrees under their actual URLs.
    let mut query_urls: Vec<_> = roots.into_iter().map(|(_, url)| url).collect();
    // Missing nodes have no BASE. Query their own history rather than scanning
    // all repository history or assuming their parent's revision applies.
    query_urls.extend(
        pending
            .iter()
            .filter(|(_, base, _)| *base == 0)
            .map(|(url, _, _)| url.clone()),
    );
    query_urls.sort();
    query_urls.dedup();
    for query_url in query_urls {
        let scoped: Vec<_> = pending
            .iter()
            .filter(|(url, base, _)| {
                url == &query_url
                    || (*base > 0
                        && url.starts_with(&format!("{}/", query_url.trim_end_matches('/'))))
            })
            .collect();
        let Some(min_base) = scoped.iter().map(|(_, base, _)| *base).min() else {
            continue;
        };
        let mut start = head;
        let mut found = 0;
        // Filter before applying the display limit, so newer local commits
        // cannot hide older incoming changes. Pin pages to the status HEAD.
        while start > min_base && found < limit.max(1) {
            let range = format!("{start}:{}", min_base + 1);
            let target = format!("{query_url}@{head}");
            let xml = execute_svn(
                &[
                    "log",
                    "--xml",
                    "--verbose",
                    "--limit",
                    "100",
                    "-r",
                    &range,
                    "--",
                    &target,
                ],
                Some(path),
            )
            .await?;
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
                    incoming |= scoped.iter().any(|(path, base, subtree)| {
                        log.revision > *base
                            && affects_pending(&url, &changed.action, path, *subtree)
                    });
                }
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
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

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
        });
        std::fs::remove_dir_all(directory).unwrap();
    }
}
