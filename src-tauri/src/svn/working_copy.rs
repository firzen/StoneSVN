use super::executor::{execute_svn, SvnError};
use super::operations::{normalize_svn_path, normalize_svn_target};
use super::parser::{parse_info_xml, parse_status_xml};
use super::properties::checked_target_path;
use std::path::{Component, Path};

pub(super) fn local_target(workspace: &str, file: &str) -> Result<String, SvnError> {
    if file.is_empty() || Path::new(file).components().any(|part| {
        matches!(part, Component::Normal(name) if name.to_string_lossy().eq_ignore_ascii_case(".svn"))
    }) {
        return Err(SvnError::InvalidArguments("Select a working-copy path outside .svn".into()));
    }
    let target = checked_target_path(workspace, file, true)?;
    Ok(normalize_svn_target(&target.to_string_lossy()))
}

pub async fn revert_preview(
    workspace: &str,
    file: &str,
) -> Result<Vec<crate::SvnStatus>, SvnError> {
    let target = local_target(workspace, file)?;
    let xml = execute_svn(
        &[
            "status",
            "--xml",
            "--verbose",
            "--depth",
            "infinity",
            "--",
            &target,
        ],
        Some(workspace),
    )
    .await?;
    let root =
        std::fs::canonicalize(workspace).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    let root = std::path::PathBuf::from(normalize_svn_path(&root.to_string_lossy()));
    let mut entries = parse_status_xml(&xml)?;
    for entry in &mut entries {
        let absolute = Path::new(&entry.path);
        let relative = absolute.strip_prefix(&root).map_err(|_| {
            SvnError::InvalidArguments("SVN returned a target outside the working copy".into())
        })?;
        entry.path = normalize_svn_path(&relative.to_string_lossy());
        if entry.path.is_empty() {
            entry.path = ".".into();
        }
        entry.directory =
            std::fs::symlink_metadata(root.join(&entry.path)).is_ok_and(|m| m.is_dir());
    }
    // Reverting a copied/moved addition (or replacement) can remove its whole
    // on-disk tree, including unversioned and ignored contents. SVN status
    // alone collapses those folders, so inventory them without following links.
    let destructive = entries
        .iter()
        .filter(|entry| {
            entry.directory
                && ((entry.status_code == "added" && entry.history)
                    || entry.status_code == "replaced")
        })
        .map(|entry| entry.path.clone())
        .collect::<Vec<_>>();
    let in_destructive_tree = |path: &str| {
        destructive
            .iter()
            .any(|parent| path == parent || path.starts_with(&format!("{parent}/")))
    };
    entries.retain(|entry| {
        in_destructive_tree(&entry.path)
            || (!matches!(
                entry.status_code.as_str(),
                "normal" | "none" | "" | "unversioned" | "ignored" | "external"
            ) || matches!(entry.prop_status.as_str(), "modified" | "conflicted")
                || entry.history)
                && !matches!(
                    entry.status_code.as_str(),
                    "unversioned" | "ignored" | "external"
                )
    });
    let mut affected = entries
        .into_iter()
        .map(|entry| (entry.path.clone(), entry))
        .collect::<std::collections::BTreeMap<_, _>>();
    let mut pending = destructive
        .iter()
        .map(|path| root.join(path))
        .collect::<Vec<_>>();
    while let Some(directory) = pending.pop() {
        for child in
            std::fs::read_dir(directory).map_err(|e| SvnError::CommandFailed(e.to_string()))?
        {
            let child = child.map_err(|e| SvnError::CommandFailed(e.to_string()))?;
            let absolute = child.path();
            let metadata = std::fs::symlink_metadata(&absolute)
                .map_err(|e| SvnError::CommandFailed(e.to_string()))?;
            let relative = absolute
                .strip_prefix(&root)
                .map_err(|e| SvnError::InvalidArguments(e.to_string()))?;
            let path = normalize_svn_path(&relative.to_string_lossy());
            affected
                .entry(path.clone())
                .or_insert_with(|| crate::SvnStatus {
                    path,
                    directory: metadata.is_dir(),
                    status: "unversioned".into(),
                    status_code: "unversioned".into(),
                    prop_status: "none".into(),
                    locked: false,
                    history: false,
                    switched: false,
                });
            if metadata.is_dir() && child.file_name() != ".svn" {
                pending.push(absolute);
            }
        }
    }
    let entries = affected.into_values().collect();
    Ok(entries)
}

pub async fn revert_reviewed(
    workspace: &str,
    files: &[String],
    preview: Option<&[crate::SvnStatus]>,
) -> Result<String, SvnError> {
    if let Some(expected) = preview {
        if files.len() != 1 {
            return Err(SvnError::InvalidArguments(
                "Review one revert scope at a time".into(),
            ));
        }
        let current = revert_preview(workspace, &files[0]).await?;
        let signature = |entries: &[crate::SvnStatus]| {
            entries
                .iter()
                .map(|entry| {
                    (
                        entry.path.clone(),
                        entry.status_code.clone(),
                        entry.prop_status.clone(),
                        entry.history,
                    )
                })
                .collect::<std::collections::BTreeSet<_>>()
        };
        if signature(&current) != signature(expected) {
            return Err(SvnError::InvalidArguments(
                "The affected files changed. Review the file tree again before reverting".into(),
            ));
        }
    }
    super::operations::revert(workspace, files).await
}

pub async fn move_target(
    workspace: &str,
    source: &str,
    destination: &str,
) -> Result<String, SvnError> {
    let from = local_target(workspace, source)?;
    local_target(workspace, destination)?;
    let root =
        std::fs::canonicalize(workspace).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    let source_path =
        crate::resolve_workspace_child(&root, source).map_err(SvnError::InvalidArguments)?;
    let destination_path =
        crate::resolve_workspace_child(&root, destination).map_err(SvnError::InvalidArguments)?;
    if source_path == root
        || destination_path == root
        || destination_path.starts_with(&source_path)
        || std::fs::symlink_metadata(&destination_path).is_ok()
    {
        return Err(SvnError::InvalidArguments(
            "Destination must be a new path outside the selected item".into(),
        ));
    }
    let xml = execute_svn(&["info", "--xml", "--", &from], Some(workspace)).await?;
    if parse_info_xml(&xml)?.schedule != "normal" {
        return Err(SvnError::InvalidArguments(
            "Only existing versioned items can be moved".into(),
        ));
    }
    let parent = destination_path
        .parent()
        .ok_or_else(|| SvnError::InvalidArguments("Invalid destination".into()))?;
    if !parent.is_dir() {
        return Err(SvnError::InvalidArguments(
            "Select an existing versioned destination directory".into(),
        ));
    }
    let parent = normalize_svn_target(&parent.to_string_lossy());
    let xml = execute_svn(&["info", "--xml", "--", &parent], Some(workspace)).await?;
    if parse_info_xml(&xml)?.schedule != "normal" {
        return Err(SvnError::InvalidArguments(
            "Destination directory must already be versioned".into(),
        ));
    }
    let status = execute_svn(
        &[
            "status",
            "--xml",
            "--verbose",
            "--depth",
            "infinity",
            "--",
            &from,
        ],
        Some(workspace),
    )
    .await?;
    if parse_status_xml(&status)?.iter().any(|entry| {
        entry.status_code == "conflicted" || entry.prop_status == "conflicted" || entry.switched
    }) {
        return Err(SvnError::InvalidArguments(
            "Resolve conflicts and switched children before moving this item".into(),
        ));
    }
    // The destination is a literal path, not a peg-revision target. Adding an
    // escaping @ here would create a file with an extra @ in its name.
    let to = normalize_svn_path(&destination_path.to_string_lossy());
    // No --force and no --parents: never replace an existing destination or
    // silently create/add destination directories.
    execute_svn(&["move", "--", &from, &to], Some(workspace)).await
}

// SVN records move origins relative to the working-copy root, which may be
// above the folder currently opened by the user.
pub(super) async fn moved_from(workspace: &str, file: &str) -> Result<Option<String>, SvnError> {
    let target = local_target(workspace, file)?;
    let xml = execute_svn(&["info", "--xml", "--", &target], Some(workspace)).await?;
    let mut reader = quick_xml::Reader::from_str(&xml);
    let mut tag = String::new();
    let mut root = None;
    let mut origin = None;
    loop {
        match reader
            .read_event()
            .map_err(|e| SvnError::ParseError(e.to_string()))?
        {
            quick_xml::events::Event::Start(e) => {
                tag = String::from_utf8_lossy(e.name().as_ref()).into_owned()
            }
            quick_xml::events::Event::Text(e) if tag == "wcroot-abspath" || tag == "moved-from" => {
                let value = e
                    .unescape()
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
                    .into_owned();
                if tag == "wcroot-abspath" {
                    root = Some(value);
                } else {
                    origin = Some(value);
                }
            }
            quick_xml::events::Event::End(_) => tag.clear(),
            quick_xml::events::Event::Eof => break,
            _ => {}
        }
    }
    let Some(origin) = origin else {
        return Ok(None);
    };
    let root = root.ok_or_else(|| SvnError::ParseError("Missing working-copy root".into()))?;
    let root = std::fs::canonicalize(root).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    let workspace =
        std::fs::canonicalize(workspace).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    let origin = root.join(origin);
    let relative = origin.strip_prefix(workspace).map_err(|_| {
        SvnError::InvalidArguments(
            "Open the working-copy root to commit a move from another folder".into(),
        )
    })?;
    Ok(Some(normalize_svn_path(&relative.to_string_lossy())))
}

pub async fn relocate(workspace: &str, url: &str) -> Result<String, SvnError> {
    let destination =
        tauri::Url::parse(url).map_err(|e| SvnError::InvalidArguments(e.to_string()))?;
    if !matches!(
        destination.scheme(),
        "http" | "https" | "svn" | "svn+ssh" | "file"
    ) || destination.query().is_some()
        || destination.fragment().is_some()
    {
        return Err(SvnError::InvalidArguments(
            "Enter a complete SVN working-copy URL".into(),
        ));
    }
    let target = local_target(workspace, ".")?;
    // Retain SVN's repository UUID/path validation. External working copies
    // are separate checkouts and are deliberately not relocated implicitly.
    execute_svn(
        &["relocate", "--ignore-externals", "--", url, &target],
        Some(workspace),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf, process::Command};
    struct Fixture {
        root: PathBuf,
        repo: PathBuf,
        wc: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let id = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "orca-wc-actions-{}-{id}-{sequence}",
                std::process::id()
            ));
            fs::create_dir_all(&root).unwrap();
            let repo = root.join("repo");
            let wc = root.join("wc");
            assert!(Command::new("svnadmin")
                .arg("create")
                .arg(&repo)
                .status()
                .unwrap()
                .success());
            let result = Self { root, repo, wc };
            result.run(&["checkout", &result.url(), result.workspace()]);
            result
        }
        fn workspace(&self) -> &str {
            self.wc.to_str().unwrap()
        }
        fn url(&self) -> String {
            format!("file://{}", self.repo.to_string_lossy())
        }
        fn run(&self, args: &[&str]) -> String {
            let output = Command::new("svn")
                .args(args)
                .current_dir(if self.wc.exists() {
                    &self.wc
                } else {
                    &self.root
                })
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{:?}: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8(output.stdout).unwrap()
        }
        fn commit(&self) {
            self.run(&["commit", "-m", "test"]);
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    #[test]
    fn moves_preserve_history_and_recursive_revert_restores_the_whole_tree() {
        let f = Fixture::new();
        fs::create_dir_all(f.wc.join("dir@name/nested")).unwrap();
        fs::create_dir(f.wc.join("destination")).unwrap();
        fs::write(f.wc.join("dir@name/nested/file.txt"), "base").unwrap();
        fs::write(f.wc.join("dir@name/deleted.txt"), "restore me").unwrap();
        f.run(&["add", "dir@name@", "destination"]);
        f.commit();
        runtime().block_on(async {
            let wc = f.workspace();
            assert!(move_target(wc, ".", "renamed").await.is_err());
            assert!(move_target(wc, "dir@name", "dir@name/sub").await.is_err());
            assert!(move_target(wc, "dir@name", "destination").await.is_err());
            assert!(move_target(wc, "dir@name", "../outside").await.is_err());
            assert!(move_target(wc, "dir@name", ".svn/internal").await.is_err());
            assert!(move_target(wc, "dir@name", "missing/target").await.is_err());
            fs::write(f.wc.join("dir@name/nested/file.txt"), "local edit").unwrap();
            move_target(
                wc,
                "dir@name/nested/file.txt",
                "dir@name/nested/renamed@file.txt",
            )
            .await
            .unwrap();
            assert_eq!(
                fs::read_to_string(f.wc.join("dir@name/nested/renamed@file.txt")).unwrap(),
                "local edit"
            );
            let status = crate::svn::status(wc).await.unwrap();
            assert!(status
                .iter()
                .any(|e| e.path == "dir@name/nested/renamed@file.txt" && e.history));
            move_target(wc, "dir@name", "destination/moved@dir")
                .await
                .unwrap();
            assert!(f
                .wc
                .join("destination/moved@dir/nested/renamed@file.txt")
                .exists());
            crate::svn::revert(wc, &[".".into()]).await.unwrap();
            assert_eq!(
                fs::read_to_string(f.wc.join("dir@name/nested/file.txt")).unwrap(),
                "base"
            );
            assert!(!f.wc.join("destination/moved@dir").exists());
            fs::write(f.wc.join("dir@name/nested/file.txt"), "another edit").unwrap();
            crate::svn::set_property(wc, "dir@name/nested", "test:property", Some("local"))
                .await
                .unwrap();
            crate::svn::delete(wc, &["dir@name/deleted.txt".into()])
                .await
                .unwrap();
            crate::svn::revert(wc, &["dir@name".into()]).await.unwrap();
            assert_eq!(
                fs::read_to_string(f.wc.join("dir@name/nested/file.txt")).unwrap(),
                "base"
            );
            assert!(f.wc.join("dir@name/deleted.txt").exists());
            assert!(crate::svn::property_details(wc, "dir@name/nested")
                .await
                .unwrap()
                .properties
                .is_empty());
            assert!(crate::svn::revert(wc, &[]).await.is_err());
            assert!(crate::svn::revert(wc, &["../repo".into()]).await.is_err());
            // A moved directory must also be committable through the client's
            // explicit file selection, without sending unrelated local edits.
            move_target(wc, "dir@name", "destination/final@dir")
                .await
                .unwrap();
            fs::write(
                f.wc.join("destination/final@dir/nested/file.txt"),
                "moved and edited",
            )
            .unwrap();
            fs::write(f.wc.join("unrelated.txt"), "keep local").unwrap();
            crate::svn::add(wc, &["unrelated.txt".into()])
                .await
                .unwrap();
            assert!(crate::svn::commit(
                wc,
                "incomplete move",
                Some(&["destination/final@dir".into()])
            )
            .await
            .is_err());
            let selected = crate::svn::status(wc)
                .await
                .unwrap()
                .into_iter()
                .filter(|e| {
                    e.path == "dir@name"
                        || e.path.starts_with("dir@name/")
                        || e.path == "destination/final@dir"
                        || e.path.starts_with("destination/final@dir/")
                })
                .map(|e| e.path)
                .collect::<Vec<_>>();
            let incomplete = selected
                .iter()
                .filter(|p| p.as_str() != "destination/final@dir/nested/file.txt")
                .cloned()
                .collect::<Vec<_>>();
            assert!(crate::svn::commit(wc, "missing child", Some(&incomplete))
                .await
                .is_err());
            crate::svn::commit(wc, "complete move", Some(&selected))
                .await
                .unwrap();
            assert_eq!(
                f.run(&[
                    "cat",
                    "-r",
                    "HEAD",
                    "destination/final@dir/nested/file.txt@"
                ]),
                "moved and edited"
            );
            assert!(f
                .run(&["status", "unrelated.txt"])
                .contains("unrelated.txt"));
        });
    }

    #[test]
    fn resolves_text_property_and_tree_conflicts_without_accepting_arbitrary_strategies() {
        let f = Fixture::new();
        for file in [
            "working.txt",
            "mine.txt",
            "theirs.txt",
            "property.txt",
            "tree.txt",
        ] {
            fs::write(f.wc.join(file), "base\n").unwrap();
        }
        f.run(&[
            "add",
            "working.txt",
            "mine.txt",
            "theirs.txt",
            "property.txt",
            "tree.txt",
        ]);
        f.run(&["propset", "test:value", "base", "property.txt"]);
        f.commit();
        let other = f.root.join("other");
        f.run(&["checkout", &f.url(), other.to_str().unwrap()]);
        for file in ["working.txt", "mine.txt", "theirs.txt"] {
            fs::write(other.join(file), "incoming\n").unwrap();
        }
        f.run(&[
            "propset",
            "test:value",
            "incoming",
            other.join("property.txt").to_str().unwrap(),
        ]);
        f.run(&["delete", other.join("tree.txt").to_str().unwrap()]);
        f.run(&["commit", other.to_str().unwrap(), "-m", "incoming"]);
        for file in ["working.txt", "mine.txt", "theirs.txt", "tree.txt"] {
            fs::write(f.wc.join(file), "local\n").unwrap();
        }
        f.run(&["propset", "test:value", "local", "property.txt"]);
        f.run(&["update", "--accept", "postpone"]);
        runtime().block_on(async {
            let wc = f.workspace();
            assert!(crate::svn::resolve(wc, &["mine.txt".into()], "--force")
                .await
                .is_err());
            assert!(crate::svn::resolve(wc, &[], "working").await.is_err());
            let statuses = crate::svn::status(wc).await.unwrap();
            assert!(statuses
                .iter()
                .any(|e| e.path == "tree.txt" && e.status_code == "conflicted"));
            fs::write(f.wc.join("working.txt"), "manually merged\n").unwrap();
            for (file, strategy, expected) in [
                ("working.txt", "working", "manually merged\n"),
                ("mine.txt", "mine-full", "local\n"),
                ("theirs.txt", "theirs-full", "incoming\n"),
            ] {
                crate::svn::resolve(wc, &[file.into()], strategy)
                    .await
                    .unwrap();
                assert_eq!(fs::read_to_string(f.wc.join(file)).unwrap(), expected);
            }
            crate::svn::resolve(wc, &["property.txt".into()], "mine-full")
                .await
                .unwrap();
            crate::svn::resolve(wc, &["tree.txt".into()], "working")
                .await
                .unwrap();
            let statuses = crate::svn::status(wc).await.unwrap();
            assert!(!statuses
                .iter()
                .any(|e| e.status_code == "conflicted" || e.prop_status == "conflicted"));
            assert_eq!(
                f.run(&["propget", "test:value", "property.txt"]).trim(),
                "local"
            );
            assert!(crate::svn::resolve(wc, &["mine.txt".into()], "working")
                .await
                .is_err());
        });
    }

    #[test]
    fn revert_preview_includes_property_changes_and_copy_children_and_rejects_changed_scopes() {
        let f = Fixture::new();
        fs::create_dir_all(f.wc.join("source@dir/nested")).unwrap();
        for file in ["nested/modified.txt", "clean.txt", "deleted.txt"] {
            fs::write(f.wc.join("source@dir").join(file), "base").unwrap();
        }
        f.run(&["add", "source@dir@"]);
        f.commit();
        runtime().block_on(async {
            let wc = f.workspace();
            fs::write(f.wc.join("source@dir/nested/modified.txt"), "local edit").unwrap();
            fs::write(f.wc.join("source@dir/untracked.txt"), "keep me").unwrap();
            crate::svn::set_property(wc, "source@dir", "test:property", Some("local property"))
                .await
                .unwrap();
            crate::svn::delete(wc, &["source@dir/deleted.txt".into()])
                .await
                .unwrap();
            let preview = revert_preview(wc, "source@dir").await.unwrap();
            assert_eq!(
                preview.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
                vec![
                    "source@dir",
                    "source@dir/deleted.txt",
                    "source@dir/nested/modified.txt"
                ]
            );
            fs::write(
                f.wc.join("source@dir/clean.txt"),
                "new edit after confirmation opened",
            )
            .unwrap();
            assert!(revert_reviewed(wc, &["source@dir".into()], Some(&preview))
                .await
                .is_err());
            assert_eq!(
                fs::read_to_string(f.wc.join("source@dir/nested/modified.txt")).unwrap(),
                "local edit"
            );
            let fresh = revert_preview(wc, "source@dir").await.unwrap();
            revert_reviewed(wc, &["source@dir".into()], Some(&fresh))
                .await
                .unwrap();
            assert_eq!(
                fs::read_to_string(f.wc.join("source@dir/nested/modified.txt")).unwrap(),
                "base"
            );
            assert_eq!(
                fs::read_to_string(f.wc.join("source@dir/untracked.txt")).unwrap(),
                "keep me"
            );
            fs::create_dir_all(f.wc.join("source@dir/untracked-folder/deep")).unwrap();
            fs::write(
                f.wc.join("source@dir/untracked-folder/deep/local.txt"),
                "nested local content",
            )
            .unwrap();
            f.run(&["copy", "source@dir@", "copy"]);
            let copied = revert_preview(wc, "copy").await.unwrap();
            assert!(copied
                .iter()
                .any(|e| e.path == "copy/nested/modified.txt" && e.history));
            assert!(copied
                .iter()
                .any(|e| e.path == "copy/deleted.txt" && e.history));
            assert!(copied
                .iter()
                .any(|e| e.path == "copy/untracked.txt" && e.status_code == "unversioned"));
            assert!(copied
                .iter()
                .any(|e| e.path == "copy/untracked-folder/deep/local.txt"
                    && e.status_code == "unversioned"));
            fs::write(f.wc.join("copy/untracked-folder/deep/late.txt"), "new item").unwrap();
            assert!(revert_reviewed(wc, &["copy".into()], Some(&copied))
                .await
                .is_err());
            let fresh_copy = revert_preview(wc, "copy").await.unwrap();
            revert_reviewed(wc, &["copy".into()], Some(&fresh_copy))
                .await
                .unwrap();
            assert!(!f.wc.join("copy").exists());
            assert!(f
                .wc
                .join("source@dir/untracked-folder/deep/local.txt")
                .exists());
            assert!(revert_preview(wc, "../repo").await.is_err());
        });
    }

    #[test]
    fn relocation_validates_repository_identity_and_preserves_local_changes() {
        let f = Fixture::new();
        fs::write(f.wc.join("file.txt"), "base").unwrap();
        f.run(&["add", "file.txt"]);
        f.commit();
        fs::write(f.wc.join("file.txt"), "local changes").unwrap();
        let other_repo = f.root.join("different-repo");
        assert!(Command::new("svnadmin")
            .arg("create")
            .arg(&other_repo)
            .status()
            .unwrap()
            .success());
        runtime().block_on(async {
            let wc = f.workspace();
            assert!(relocate(wc, "javascript:alert(1)").await.is_err());
            assert!(
                relocate(wc, &format!("file://{}", other_repo.to_string_lossy()))
                    .await
                    .is_err()
            );
            assert_eq!(crate::svn::info(wc).await.unwrap().url, f.url());
            let moved_repo = f.root.join("relocated-repo");
            fs::rename(&f.repo, &moved_repo).unwrap();
            let url = format!("file://{}", moved_repo.to_string_lossy());
            relocate(wc, &url).await.unwrap();
            assert_eq!(crate::svn::info(wc).await.unwrap().url, url);
            assert_eq!(
                fs::read_to_string(f.wc.join("file.txt")).unwrap(),
                "local changes"
            );
        });
    }
}
