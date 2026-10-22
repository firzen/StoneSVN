use super::executor::{execute_svn, SvnError};
use quick_xml::{events::Event, Reader};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Serialize)]
pub struct UpdatedFile {
    pub directory: bool,
    pub path: String,
    pub action: String,
    pub old_revision: u64,
    pub new_revision: u64,
    pub target: String,
}

#[derive(Serialize)]
pub struct UpdateResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub files: Vec<UpdatedFile>,
    pub warning: Option<String>,
}

#[derive(Default)]
struct Node {
    directory: bool,
    revision: u64,
    url: String,
}

fn parse_nodes(xml: &str) -> Result<BTreeMap<String, Node>, SvnError> {
    let mut reader = Reader::from_str(xml);
    let mut nodes = BTreeMap::new();
    let mut path = String::new();
    let mut node = Node::default();
    let mut in_url = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) if e.name().as_ref() == b"entry" => {
                node = Node::default();
                for attr in e.attributes() {
                    let attr = attr.map_err(|e| SvnError::ParseError(e.to_string()))?;
                    let value = attr
                        .unescape_value()
                        .map_err(|e| SvnError::ParseError(e.to_string()))?;
                    match attr.key.as_ref() {
                        b"kind" => node.directory = value == "dir",
                        b"path" => path = value.into_owned(),
                        b"revision" => node.revision = value.parse().unwrap_or(0),
                        _ => {}
                    }
                }
                #[cfg(windows)]
                {
                    path = path.replace('\\', "/");
                }
            }
            Ok(Event::Start(e)) if e.name().as_ref() == b"url" => in_url = true,
            Ok(Event::Text(e)) if in_url => {
                node.url = e
                    .unescape()
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
                    .into_owned();
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"url" => in_url = false,
            Ok(Event::End(e)) if e.name().as_ref() == b"entry" => {
                nodes.insert(path.clone(), std::mem::take(&mut node));
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(SvnError::ParseError(e.to_string())),
            _ => {}
        }
    }
    Ok(nodes)
}

async fn snapshot(path: &str) -> Result<BTreeMap<String, Node>, SvnError> {
    let xml = execute_svn(
        &["info", "--xml", "--depth", "infinity", "--", "."],
        Some(path),
    )
    .await?;
    parse_nodes(&xml)
}

fn notifications(output: &str) -> BTreeMap<String, Vec<u8>> {
    let mut paths = BTreeMap::new();
    for line in output.lines() {
        let bytes = line.as_bytes();
        if bytes.len() < 6
            || bytes[4] != b' '
            || !bytes[..4].iter().all(|b| b" ADUCGERB".contains(b))
            || !bytes[..4].iter().any(|b| b"ADUCGER".contains(b))
        {
            continue;
        }
        let path = line[5..].to_string();
        #[cfg(windows)]
        let path = path.replace('\\', "/");
        paths.insert(path, bytes[..4].to_vec());
    }
    paths
}

// After the update only changed nodes and their surviving ancestors are needed.
// Avoid serializing metadata for every unchanged file a second time.
async fn snapshot_changed(path: &str, output: &str) -> Result<BTreeMap<String, Node>, SvnError> {
    let changed = notifications(output);
    if changed.is_empty() {
        return Ok(BTreeMap::new());
    }
    let mut targets = std::collections::BTreeSet::from([".".to_string()]);
    for file in changed.keys() {
        let mut candidate = std::path::Path::new(file).to_path_buf();
        loop {
            if candidate.as_os_str().is_empty() {
                break;
            }
            if std::fs::symlink_metadata(std::path::Path::new(path).join(&candidate)).is_ok() {
                targets.insert(candidate.to_string_lossy().into_owned());
            }
            if !candidate.pop() {
                break;
            }
        }
    }
    let targets: Vec<_> = targets
        .into_iter()
        .map(|target| super::operations::normalize_svn_target(&target))
        .collect();
    let mut nodes = BTreeMap::new();
    for group in targets.chunks(64) {
        let mut args = vec!["info", "--xml", "--depth", "empty", "--"];
        args.extend(group.iter().map(String::as_str));
        nodes.extend(parse_nodes(&execute_svn(&args, Some(path)).await?)?);
    }
    Ok(nodes)
}

fn updated_files(
    output: &str,
    before: &BTreeMap<String, Node>,
    after: &BTreeMap<String, Node>,
) -> Vec<UpdatedFile> {
    let mut files = BTreeMap::new();
    for (path, status) in notifications(output) {
        let old = before.get(&path);
        let new = after.get(&path);
        // Exclude progress messages and skipped paths, which have no node metadata.
        let Some(peg) = new.or(old) else {
            continue;
        };
        let action = if status.contains(&b'C') {
            "C"
        } else if old.is_none() && status[0] == b'A' {
            "A"
        } else if new.is_none() && status[0] == b'D' {
            "D"
        } else if status[0] == b'A' || status[0] == b'R' {
            "R"
        } else {
            "M"
        };
        // Missing sides use the surviving parent's BASE, never the workspace root's
        // potentially unrelated revision in a mixed-revision working copy.
        let parent_revision = |nodes: &BTreeMap<String, Node>| {
            let mut parent = std::path::Path::new(&path).parent();
            while let Some(dir) = parent {
                let key = if dir.as_os_str().is_empty() {
                    ".".into()
                } else {
                    dir.to_string_lossy().into_owned()
                };
                if let Some(node) = nodes.get(&key) {
                    return node.revision;
                }
                parent = dir.parent();
            }
            0
        };
        files.insert(
            path.clone(),
            UpdatedFile {
                directory: peg.directory,
                path: path.clone(),
                action: action.into(),
                old_revision: old
                    .map(|node| node.revision)
                    .unwrap_or_else(|| parent_revision(before)),
                new_revision: new
                    .map(|node| node.revision)
                    .unwrap_or_else(|| parent_revision(after)),
                target: format!("{}@{}", peg.url, peg.revision),
            },
        );
    }
    files.into_values().collect()
}

pub async fn update_with_result(
    path: &str,
    revision: Option<u64>,
) -> Result<UpdateResult, SvnError> {
    let before = snapshot(path).await?;
    let output = super::operations::update(path, revision).await?;
    // A metadata failure after a successful mutation must not report the update as failed.
    let (files, warning) = match snapshot_changed(path, &output).await {
        Ok(after) => (updated_files(&output, &before, &after), None),
        Err(error) => (Vec::new(), Some(error.to_string())),
    };
    Ok(UpdateResult {
        success: true,
        output,
        error: None,
        files,
        warning,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_update_lists_actual_changes_and_previews_additions_and_deletions() {
        use std::{fs, process::Command};
        let root = std::env::temp_dir().join(format!(
            "stonesvn-update-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let run = |program: &str, args: &[&str], cwd: &std::path::Path| {
            let output = Command::new(program)
                .args(args)
                .current_dir(cwd)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        run("svnadmin", &["create", "repo"], &root);
        let url = tauri::Url::from_directory_path(root.join("repo"))
            .unwrap()
            .to_string();
        run("svn", &["checkout", &url, "author"], &root);
        let author = root.join("author");
        fs::write(author.join("中文 @.txt"), "before\n").unwrap();
        fs::write(author.join("gone.txt"), "deleted content\n").unwrap();
        fs::write(author.join("unchanged.txt"), "unchanged\n").unwrap();
        run(
            "svn",
            &["add", "--", "中文 @.txt@", "gone.txt", "unchanged.txt"],
            &author,
        );
        run("svn", &["commit", "-m", "initial"], &author);
        run("svn", &["checkout", &url, "reader"], &root);
        fs::write(author.join("中文 @.txt"), "after\n").unwrap();
        fs::write(author.join("new.txt"), "added content\n").unwrap();
        run("svn", &["add", "new.txt"], &author);
        run("svn", &["delete", "gone.txt"], &author);
        run("svn", &["commit", "-m", "changes"], &author);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let reader = root.join("reader");
            let workspace = reader.to_str().unwrap();
            let result = update_with_result(workspace, None).await.unwrap();
            assert!(result.warning.is_none());
            assert_eq!(result.files.len(), 3, "{}", result.output);
            let scoped = snapshot_changed(workspace, &result.output).await.unwrap();
            assert!(!scoped.contains_key("unchanged.txt"));
            assert_eq!(scoped.len(), 3); // root, modified file, added file
            assert!(snapshot_changed(workspace, "At revision 2.\n")
                .await
                .unwrap()
                .is_empty());
            for file in &result.files {
                let expected = match file.path.as_str() {
                    "new.txt" => "A",
                    "gone.txt" => "D",
                    _ => "M",
                };
                assert_eq!(file.action, expected);
                let preview = super::super::preview::file_preview(
                    workspace,
                    &file.target,
                    Some(file.old_revision),
                    Some(file.new_revision),
                )
                .await
                .unwrap();
                assert!(!preview.result.diff.is_empty(), "{}", file.path);
            }
            assert!(update_with_result(workspace, None)
                .await
                .unwrap()
                .files
                .is_empty());
        });
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_results_preserve_directory_kind_for_added_and_deleted_nodes() {
        let before = parse_nodes(r#"<info><entry kind="dir" path="old" revision="1"><url>file:///repo/old</url></entry></info>"#).unwrap();
        let after = parse_nodes(r#"<info><entry kind="dir" path="new" revision="2"><url>file:///repo/new</url></entry></info>"#).unwrap();
        let files = updated_files("D    old\nA    new\n", &before, &after);
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|file| file.directory));
    }

    #[test]
    fn notifications_use_node_revisions_and_handle_properties_add_delete_and_conflict() {
        let before = parse_nodes(r#"<info><entry path="." revision="9"><url>file:///repo</url></entry><entry path="中文 @.txt" revision="2"><url>file:///repo/name%20@.txt</url></entry><entry path="gone" revision="3"><url>file:///repo/gone</url></entry></info>"#).unwrap();
        let after = parse_nodes(r#"<info><entry path="." revision="10"><url>file:///repo</url></entry><entry path="中文 @.txt" revision="10"><url>file:///repo/name%20@.txt</url></entry><entry path="new" revision="10"><url>file:///repo/new</url></entry></info>"#).unwrap();
        let files = updated_files(
            "Updating '.':\n U   中文 @.txt\nD    gone\nA    new\nUpdated to revision 10.\n",
            &before,
            &after,
        );
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].action, "D");
        assert_eq!(files[0].target, "file:///repo/gone@3");
        assert_eq!(files[0].new_revision, 10);
        assert_eq!(files[1].action, "A");
        assert_eq!(files[1].old_revision, 9);
        assert_eq!(files[2].action, "M");
        assert_eq!(files[2].old_revision, 2);
        assert_eq!(
            updated_files("C    中文 @.txt\n", &before, &after)[0].action,
            "C"
        );
        assert!(updated_files("At revision 10.\n", &after, &after).is_empty());
    }
}
