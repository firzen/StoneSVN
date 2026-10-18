use super::executor::{execute_svn, SvnError};
use base64::{engine::general_purpose::STANDARD, Engine};
use quick_xml::{events::Event, Reader};
use serde::Serialize;
use std::{fs, path::PathBuf};

#[derive(Debug, Serialize)]
pub struct SvnProperty {
    pub name: String,
    pub value: String,
    pub binary: bool,
}

#[derive(Serialize)]
pub struct PropertyDetails {
    pub info: Option<crate::SvnInfo>,
    pub directory: bool,
    pub link_target: Option<String>,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub editable: bool,
    pub properties: Vec<SvnProperty>,
}

fn target_path(workspace: &str, file: &str) -> Result<PathBuf, SvnError> {
    checked_target_path(workspace, file, false)
}

// Inspection may read a link entry, but must still validate its parent.
// Listing and mutations continue to validate the resolved target itself.
pub(super) fn checked_target_path(
    workspace: &str,
    file: &str,
    inspect_link: bool,
) -> Result<PathBuf, SvnError> {
    let root = fs::canonicalize(workspace).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    let target = crate::resolve_workspace_child(&root, file).map_err(SvnError::InvalidArguments)?;
    // Check the nearest existing ancestor too, including symlinked directories.
    let mut ancestor =
        if inspect_link && fs::symlink_metadata(&target).is_ok_and(|m| m.is_symlink()) {
            target
                .parent()
                .ok_or_else(|| SvnError::InvalidArguments(file.into()))?
        } else {
            target.as_path()
        };
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| SvnError::InvalidArguments(file.into()))?;
    }
    let actual = fs::canonicalize(ancestor).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    if !actual.starts_with(&root) {
        return Err(SvnError::InvalidArguments(
            "Target must be inside the working copy".into(),
        ));
    }
    Ok(target)
}

#[derive(Debug, Serialize)]
pub struct WorkspaceChild {
    pub path: String,
    pub name: String,
    pub directory: bool,
    pub expandable: bool,
}

pub fn workspace_children(
    workspace: &str,
    directory: &str,
) -> Result<Vec<WorkspaceChild>, SvnError> {
    let target = target_path(workspace, directory)?;
    let mut children = Vec::new();
    for entry in fs::read_dir(target).map_err(|e| SvnError::CommandFailed(e.to_string()))? {
        let entry = entry.map_err(|e| SvnError::CommandFailed(e.to_string()))?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| SvnError::CommandFailed("File name is not valid UTF-8".into()))?;
        if name.eq_ignore_ascii_case(".svn") {
            continue;
        }
        // Directory links use folder icons but remain leaves to avoid cycles
        // and traversal outside the working copy.
        let kind = entry
            .file_type()
            .map_err(|e| SvnError::CommandFailed(e.to_string()))?;
        let path = if directory == "." || directory.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", directory.trim_end_matches('/'), name)
        };
        children.push(WorkspaceChild {
            path,
            name,
            directory: kind.is_dir() || (kind.is_symlink() && entry.path().is_dir()),
            expandable: kind.is_dir(),
        });
    }
    children.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(children)
}

/// Search local paths without expanding directory links or SVN administration.
pub fn workspace_search(workspace: &str, query: &str) -> Result<Vec<WorkspaceChild>, SvnError> {
    let query = query.trim().replace('\\', "/").to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let mut pending = vec![".".to_string()];
    let mut matches = Vec::new();
    while let Some(directory) = pending.pop() {
        for child in workspace_children(workspace, &directory)? {
            if child.expandable {
                pending.push(child.path.clone());
            }
            if child.path.to_lowercase().contains(&query) {
                matches.push(child);
            }
        }
    }
    matches.sort_by(|a, b| {
        a.path
            .to_lowercase()
            .cmp(&b.path.to_lowercase())
            .then_with(|| a.path.cmp(&b.path))
    });
    Ok(matches)
}

pub async fn restore_file_revision(
    workspace: &str,
    file: &str,
    revision: u64,
) -> Result<String, SvnError> {
    let target = target_path(workspace, file)?;
    if revision == 0 || (!target.is_file() && !target.is_dir()) || target.is_symlink() {
        return Err(SvnError::InvalidArguments(
            "Select a versioned file or directory and a revision greater than zero".into(),
        ));
    }
    let directory = target.is_dir();
    let merge_target = super::operations::normalize_svn_path(&target.to_string_lossy());
    let target = super::operations::normalize_svn_target(&merge_target);
    let status = execute_svn(
        &[
            "status",
            "--xml",
            "--verbose",
            "--no-ignore",
            "--depth",
            if directory { "infinity" } else { "empty" },
            "--",
            &target,
        ],
        Some(workspace),
    )
    .await?;
    if super::parser::parse_status_xml(&status)?
        .iter()
        .any(|entry| {
            !matches!(entry.status_code.as_str(), "normal" | "none" | "")
                || entry.prop_status == "modified"
                || entry.prop_status == "conflicted"
                || entry.switched
        })
    {
        return Err(SvnError::InvalidArguments(
            "The target or its children have local changes, untracked items or switched paths. Commit, stash or revert changes before restoring a revision"
                .into(),
        ));
    }
    let info_xml = execute_svn(&["info", "--xml", "--", &target], Some(workspace)).await?;
    let info = super::parser::parse_info_xml(&info_xml)?;
    if info.revision == 0 || info.schedule != "normal" {
        return Err(SvnError::InvalidArguments(
            "Select an existing versioned file or directory".into(),
        ));
    }
    if directory {
        let tree_info = execute_svn(
            &["info", "--xml", "--depth", "infinity", "--", &target],
            Some(workspace),
        )
        .await?;
        validate_restore_directory(&tree_info, info.revision)?;
        let source = format!("{}@{}", merge_target, info.revision);
        let range = format!("{}:{}", info.revision, revision);
        // Use the selected directory as cwd and an explicit '.' target so paths
        // containing @ work and no sibling or parent directory is merged.
        return execute_svn(
            &[
                "merge",
                "--ignore-ancestry",
                "--depth",
                "infinity",
                "-r",
                &range,
                "--",
                &source,
                ".",
            ],
            Some(&merge_target),
        )
        .await;
    }
    // A local file source also selects that exact file as the implicit target.
    // Passing an explicit target breaks filenames containing @ in SVN merge.
    let source = format!("{}@{}", merge_target, info.revision);
    let range = format!("{}:{}", info.revision, revision);
    execute_svn(
        &["merge", "--ignore-ancestry", "-r", &range, "--", &source],
        Some(workspace),
    )
    .await
}

// A range based on the selected directory's BASE revision is only exact
// when every child shares that revision and all directories are fully present.
fn validate_restore_directory(xml: &str, revision: u64) -> Result<(), SvnError> {
    let mut reader = Reader::from_str(xml);
    let mut in_depth = false;
    loop {
        match reader
            .read_event()
            .map_err(|e| SvnError::ParseError(e.to_string()))?
        {
            Event::Start(e) if e.name().as_ref() == b"entry" => {
                let base = e
                    .try_get_attribute("revision")
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
                    .and_then(|attr| std::str::from_utf8(&attr.value).ok()?.parse::<u64>().ok());
                if base != Some(revision) {
                    return Err(SvnError::InvalidArguments(
                        "Update the directory to a single revision before restoring it".into(),
                    ));
                }
            }
            Event::Start(e) if e.name().as_ref() == b"depth" => in_depth = true,
            Event::Text(e) if in_depth => {
                if e.unescape()
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
                    != "infinity"
                {
                    return Err(SvnError::InvalidArguments(
                        "Fully check out the directory and its children before restoring it".into(),
                    ));
                }
            }
            Event::End(e) if e.name().as_ref() == b"depth" => in_depth = false,
            Event::Eof => return Ok(()),
            _ => {}
        }
    }
}

fn parse_properties(xml: &str) -> Result<Vec<SvnProperty>, SvnError> {
    // XML line endings are normalized before entity decoding. Windows SVN
    // emits CRLF on stdout; explicit &#13; property characters remain intact.
    let normalized = xml.replace("\r\n", "\n").replace('\r', "\n");
    let mut reader = Reader::from_str(&normalized);
    let mut properties = Vec::new();
    let mut current: Option<(String, String, bool)> = None;
    loop {
        match reader
            .read_event()
            .map_err(|e| SvnError::ParseError(e.to_string()))?
        {
            Event::Empty(e) if e.name().as_ref() == b"property" => {
                let name = e
                    .try_get_attribute("name")
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
                    .map(|a| a.unescape_value().map(|v| v.into_owned()))
                    .transpose()
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
                    .unwrap_or_default();
                properties.push(SvnProperty {
                    name,
                    value: String::new(),
                    binary: false,
                });
            }
            Event::Start(e) if e.name().as_ref() == b"property" => {
                let mut name = String::new();
                let mut encoded = false;
                for attr in e.attributes() {
                    let attr = attr.map_err(|e| SvnError::ParseError(e.to_string()))?;
                    let value = attr
                        .unescape_value()
                        .map_err(|e| SvnError::ParseError(e.to_string()))?;
                    match attr.key.as_ref() {
                        b"name" => name = value.into_owned(),
                        b"encoding" => encoded = value == "base64",
                        _ => {}
                    }
                }
                current = Some((name, String::new(), encoded));
            }
            Event::Text(e) => {
                if let Some((_, value, _)) = &mut current {
                    value.push_str(
                        &e.unescape()
                            .map_err(|e| SvnError::ParseError(e.to_string()))?,
                    );
                }
            }
            Event::CData(e) => {
                if let Some((_, value, _)) = &mut current {
                    value.push_str(&String::from_utf8_lossy(&e));
                }
            }
            Event::End(e) if e.name().as_ref() == b"property" => {
                if let Some((name, mut value, encoded)) = current.take() {
                    let mut binary = false;
                    if encoded {
                        let bytes = STANDARD
                            .decode(value.split_whitespace().collect::<String>())
                            .map_err(|e| SvnError::ParseError(e.to_string()))?;
                        match String::from_utf8(bytes) {
                            Ok(text) if !text.contains('\0') => value = text,
                            _ => {
                                binary = true;
                                value.clear();
                            }
                        }
                    }
                    // SVN translates its reserved text properties to native
                    // line endings. Keep the editor representation platform-neutral.
                    if !binary && name.starts_with("svn:") {
                        value = value.replace("\r\n", "\n").replace('\r', "\n");
                    }
                    properties.push(SvnProperty {
                        name,
                        value,
                        binary,
                    });
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    properties.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(properties)
}

pub async fn property_details(workspace: &str, file: &str) -> Result<PropertyDetails, SvnError> {
    let target = checked_target_path(workspace, file, true)?;
    let metadata = fs::symlink_metadata(&target).ok();
    let link_target = if metadata.as_ref().is_some_and(|m| m.is_symlink()) {
        Some(
            fs::read_link(&target)
                .map_err(|e| SvnError::CommandFailed(e.to_string()))?
                .to_string_lossy()
                .into_owned(),
        )
    } else {
        None
    };
    let svn_target = super::operations::normalize_svn_target(&target.to_string_lossy());
    let info = match execute_svn(&["info", "--xml", "--", &svn_target], Some(workspace)).await {
        Ok(xml) => Some(super::parser::parse_info_xml(&xml)?),
        Err(error)
            if ["W155010", "E155010", "E155007"]
                .iter()
                .any(|code| error.to_string().contains(code)) =>
        {
            None
        }
        Err(error) => return Err(error),
    };
    let directory = info
        .as_ref()
        .map(|info| info.node_kind == "dir")
        .unwrap_or_else(|| metadata.as_ref().is_some_and(|m| m.is_dir()));
    let editable = info.as_ref().is_some_and(|info| info.schedule != "delete")
        && metadata.is_some()
        && (link_target.is_none() || target_path(workspace, file).is_ok());
    let properties = if info.as_ref().is_some_and(|info| info.schedule != "delete") {
        let target = super::operations::normalize_svn_target(&target.to_string_lossy());
        parse_properties(
            &execute_svn(
                &[
                    "proplist",
                    "--xml",
                    "--verbose",
                    "--depth",
                    "empty",
                    "--",
                    &target,
                ],
                Some(workspace),
            )
            .await?,
        )?
    } else {
        Vec::new()
    };
    Ok(PropertyDetails {
        info,
        directory,
        link_target,
        editable,
        properties,
        size: metadata.as_ref().filter(|m| m.is_file()).map(|m| m.len()),
        modified: metadata
            .and_then(|m| m.modified().ok())
            .map(|time| chrono::DateTime::<chrono::Local>::from(time).to_rfc3339()),
    })
}

// A plain add can be reverted without removing local files. Reverting copies or
// moves can remove their contents, so reject those before touching metadata.
pub async fn cancel_add(workspace: &str, file: &str) -> Result<String, SvnError> {
    let target = checked_target_path(workspace, file, true)?;
    let svn_target = super::operations::normalize_svn_target(&target.to_string_lossy());
    let xml = execute_svn(&["info", "--xml", "--", &svn_target], Some(workspace)).await?;
    let info = super::parser::parse_info_xml(&xml)?;
    if info.schedule != "add" {
        return Err(SvnError::InvalidArguments(
            "Only items scheduled for addition can be unadded".into(),
        ));
    }
    let xml = execute_svn(
        &[
            "status",
            "--xml",
            "--verbose",
            "--depth",
            "infinity",
            "--",
            &svn_target,
        ],
        Some(workspace),
    )
    .await?;
    let entries = super::parser::parse_status_xml(&xml)?;
    if entries.is_empty()
        || entries.iter().any(|entry| {
            entry.history
                || !matches!(
                    entry.status_code.as_str(),
                    "added" | "unversioned" | "ignored"
                )
        })
    {
        return Err(SvnError::InvalidArguments(
            "Cannot cancel addition of copied, moved or mixed-status items while preserving local files".into(),
        ));
    }
    execute_svn(
        &["revert", "--depth", "infinity", "--", &svn_target],
        Some(workspace),
    )
    .await
}

pub async fn set_property(
    workspace: &str,
    file: &str,
    name: &str,
    value: Option<&str>,
) -> Result<(), SvnError> {
    if name.is_empty()
        || name.trim() != name
        || name.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(SvnError::InvalidArguments("Invalid property name".into()));
    }
    let target = target_path(workspace, file)?;
    let target = super::operations::normalize_svn_target(&target.to_string_lossy());
    // Windows SVN expands wildcard argv values such as svn:executable="*".
    // A value file also preserves exact UTF-8 bytes and multiline values.
    if let Some(value) = value {
        use std::io::Write;
        struct ValueFile(PathBuf);
        impl Drop for ValueFile {
            fn drop(&mut self) {
                let _ = fs::remove_file(&self.0);
            }
        }
        let path = std::env::temp_dir().join(format!(
            "stonesvn-property-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|error| SvnError::CommandFailed(error.to_string()))?
                .as_nanos()
        ));
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut output = options
            .open(&path)
            .map_err(|error| SvnError::CommandFailed(error.to_string()))?;
        let value_file = ValueFile(path);
        output
            .write_all(value.as_bytes())
            .map_err(|error| SvnError::CommandFailed(error.to_string()))?;
        drop(output);
        let path = super::operations::normalize_svn_path(&value_file.0.to_string_lossy());
        execute_svn(
            &["propset", "--file", &path, "--", name, &target],
            Some(workspace),
        )
        .await?;
    } else {
        execute_svn(&["propdel", "--", name, &target], Some(workspace)).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn directory_listing_is_shallow_includes_hidden_files_and_excludes_svn() {
        let id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("orca-children-{}-{id}", std::process::id()));
        fs::create_dir_all(root.join("folder/nested")).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        fs::create_dir(root.join(".svn")).unwrap();
        fs::write(root.join(".hidden"), "hidden").unwrap();
        fs::write(root.join("normal.txt"), "normal").unwrap();
        fs::write(root.join("folder/child.txt"), "child").unwrap();
        let workspace = root.to_str().unwrap();
        let children = workspace_children(workspace, ".").unwrap();
        assert_eq!(children.len(), 3);
        assert_eq!(children[0].path, "folder");
        assert!(children[0].directory);
        assert!(children.iter().any(|child| child.name == ".hidden"));
        assert!(!children.iter().any(|child| child.path.contains('/')));
        let folder = workspace_children(workspace, "folder").unwrap();
        assert_eq!(folder.len(), 2);
        assert!(folder.iter().any(|child| child.path == "folder/child.txt"));
        assert!(workspace_children(workspace, "../").is_err());
        assert!(workspace_children(workspace, "missing").is_err());
        let matches = workspace_search(workspace, "CHILD.TXT").unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].path, "folder/child.txt");
        assert!(!matches[0].directory);
        assert_eq!(
            workspace_search(workspace, "folder\\child").unwrap().len(),
            1
        );
        assert!(workspace_search(workspace, ".svn").unwrap().is_empty());
        assert!(workspace_search(workspace, "no-match").unwrap().is_empty());
        assert!(workspace_search(workspace, "  ").unwrap().is_empty());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.parent().unwrap(), root.join("outside")).unwrap();
            let children = workspace_children(workspace, ".").unwrap();
            assert!(
                children
                    .iter()
                    .find(|child| child.name == "outside")
                    .unwrap()
                    .directory
            );
            assert!(
                !children
                    .iter()
                    .find(|child| child.name == "outside")
                    .unwrap()
                    .expandable
            );
            assert!(workspace_children(workspace, "outside").is_err());
            std::os::unix::fs::symlink(&root, root.join("folder/back")).unwrap();
            let matches = workspace_search(workspace, "back").unwrap();
            assert_eq!(matches.len(), 1);
            assert_eq!(matches[0].path, "folder/back");
            assert!(matches[0].directory);
            assert!(!matches[0].expandable);
        }
    }

    #[test]
    fn property_xml_normalizes_transport_newlines_but_preserves_encoded_carriage_returns() {
        let properties = parse_properties(
            "<properties><target path=\".\"><property name=\"test:line\">one\r\ntwo\r\n</property><property name=\"test:reference\">a&#13;\r\nb</property></target></properties>"
        ).unwrap();
        assert_eq!(properties[0].value, "one\ntwo\n");
        assert_eq!(properties[1].value, "a\r\nb");
    }

    #[test]
    fn reserved_properties_normalize_native_newlines_without_changing_custom_values() {
        let properties = parse_properties(
            "<properties><target path=\".\"><property name=\"svn:ignore\">*.log&#13;\ncache&#13;\n</property><property name=\"test:custom\">a&#13;\nb</property></target></properties>"
        ).unwrap();
        assert_eq!(properties[0].value, "*.log\ncache\n");
        assert_eq!(properties[1].value, "a\r\nb");
    }

    #[test]
    fn preserves_property_text_empty_and_binary_values() {
        let properties = parse_properties(
            r#"<?xml version="1.0"?><properties><target path=".">
            <property name="test:empty"/>
            <property name="test:text">  a &amp; b
第二行  </property>
            <property name="test:binary" encoding="base64">AP8=</property>
            </target></properties>"#,
        )
        .unwrap();
        assert_eq!(properties.len(), 3);
        assert!(properties[0].binary);
        assert_eq!(properties[1].value, "");
        assert_eq!(properties[2].value, "  a & b\n第二行  ");
    }

    #[test]
    fn cancel_add_keeps_files_and_rejects_versioned_items_and_copies() {
        use std::process::Command;
        let id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("orca-cancel-add-{}-{id}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        let repository = root.join("repo");
        let wc = root.join("wc");
        let run = |args: &[&str]| {
            let output = Command::new("svn").args(args).output().unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        assert!(Command::new("svnadmin")
            .arg("create")
            .arg(&repository)
            .status()
            .unwrap()
            .success());
        run(&[
            "checkout",
            tauri::Url::from_file_path(&repository).unwrap().as_str(),
            wc.to_str().unwrap(),
        ]);
        fs::write(wc.join("tracked.txt"), "base").unwrap();
        run(&["add", wc.join("tracked.txt").to_str().unwrap()]);
        run(&["commit", wc.to_str().unwrap(), "-m", "initial"]);
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let workspace = wc.to_str().unwrap();
                fs::write(wc.join("new@file.txt"), "new content").unwrap();
                crate::svn::add(workspace, &["new@file.txt".into()])
                    .await
                    .unwrap();
                cancel_add(workspace, "new@file.txt").await.unwrap();
                assert_eq!(
                    fs::read_to_string(wc.join("new@file.txt")).unwrap(),
                    "new content"
                );
                assert!(property_details(workspace, "new@file.txt")
                    .await
                    .unwrap()
                    .info
                    .is_none());
                fs::create_dir_all(wc.join("new-dir/nested")).unwrap();
                fs::write(wc.join("new-dir/nested/file"), "nested content").unwrap();
                crate::svn::add(workspace, &["new-dir".into()])
                    .await
                    .unwrap();
                cancel_add(workspace, "new-dir").await.unwrap();
                assert_eq!(
                    fs::read_to_string(wc.join("new-dir/nested/file")).unwrap(),
                    "nested content"
                );
                assert!(property_details(workspace, "new-dir")
                    .await
                    .unwrap()
                    .info
                    .is_none());
                fs::write(wc.join("tracked.txt"), "local edits").unwrap();
                assert!(cancel_add(workspace, "tracked.txt").await.is_err());
                assert_eq!(
                    fs::read_to_string(wc.join("tracked.txt")).unwrap(),
                    "local edits"
                );
                run(&[
                    "copy",
                    wc.join("tracked.txt").to_str().unwrap(),
                    wc.join("copy.txt").to_str().unwrap(),
                ]);
                assert!(cancel_add(workspace, "copy.txt").await.is_err());
                assert_eq!(
                    fs::read_to_string(wc.join("copy.txt")).unwrap(),
                    "local edits"
                );
                // A plain added parent can also contain a copied child.
                fs::create_dir(wc.join("mixed")).unwrap();
                crate::svn::add(workspace, &["mixed".into()]).await.unwrap();
                run(&[
                    "copy",
                    wc.join("tracked.txt").to_str().unwrap(),
                    wc.join("mixed/copy.txt").to_str().unwrap(),
                ]);
                assert!(cancel_add(workspace, "mixed").await.is_err());
                assert_eq!(
                    fs::read_to_string(wc.join("mixed/copy.txt")).unwrap(),
                    "local edits"
                );
                assert!(cancel_add(workspace, "../repo").await.is_err());
            });
    }

    #[test]
    fn restores_directory_tree_as_local_changes_without_touching_siblings() {
        use std::process::Command;
        let id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("orca-restore-dir-{}-{id}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        let repository = root.join("repo");
        let wc = root.join("wc");
        assert!(Command::new("svnadmin")
            .arg("create")
            .arg(&repository)
            .status()
            .unwrap()
            .success());
        let run = |args: &[&str]| {
            let output = Command::new("svn")
                .args(args)
                .current_dir(&root)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        run(&[
            "checkout",
            tauri::Url::from_file_path(&repository).unwrap().as_str(),
            wc.to_str().unwrap(),
        ]);
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let workspace = wc.to_str().unwrap();
                let dir = "目录@tree";
                fs::create_dir_all(wc.join(dir).join("nested")).unwrap();
                fs::write(wc.join(dir).join("nested/file.txt"), "old content").unwrap();
                fs::write(wc.join(dir).join("old.txt"), "restore me").unwrap();
                fs::write(wc.join("sibling.txt"), "old sibling").unwrap();
                crate::svn::add(workspace, &[dir.into(), "sibling.txt".into()])
                    .await
                    .unwrap();
                set_property(workspace, dir, "svn:ignore", Some("*.tmp"))
                    .await
                    .unwrap();
                run(&["commit", workspace, "-m", "initial"]);
                fs::write(wc.join(dir).join("nested/file.txt"), "new content").unwrap();
                fs::write(wc.join(dir).join("new.txt"), "delete me").unwrap();
                fs::write(wc.join("sibling.txt"), "new sibling").unwrap();
                crate::svn::add(workspace, &[format!("{dir}/new.txt")])
                    .await
                    .unwrap();
                crate::svn::delete(workspace, &[format!("{dir}/old.txt")])
                    .await
                    .unwrap();
                set_property(workspace, dir, "test:directory", Some("new"))
                    .await
                    .unwrap();
                set_property(
                    workspace,
                    &format!("{dir}/nested/file.txt"),
                    "test:file",
                    Some("new"),
                )
                .await
                .unwrap();
                run(&["commit", workspace, "-m", "second"]);
                // Committing leaves untouched children at their older BASE revision.
                assert!(restore_file_revision(workspace, dir, 1).await.is_err());
                run(&["update", workspace]);
                for loose in ["untracked.txt", "ignored.tmp"] {
                    let path = wc.join(dir).join(loose);
                    fs::write(&path, "keep me").unwrap();
                    assert!(restore_file_revision(workspace, dir, 1).await.is_err());
                    assert_eq!(fs::read_to_string(&path).unwrap(), "keep me");
                    fs::remove_file(path).unwrap();
                }
                let child = format!("{dir}/nested/file.txt");
                fs::write(wc.join(&child), "local edits").unwrap();
                assert!(restore_file_revision(workspace, dir, 1).await.is_err());
                assert_eq!(fs::read_to_string(wc.join(&child)).unwrap(), "local edits");
                crate::svn::revert(workspace, &[child.clone()])
                    .await
                    .unwrap();
                set_property(workspace, &child, "test:local", Some("pending"))
                    .await
                    .unwrap();
                assert!(restore_file_revision(workspace, dir, 1).await.is_err());
                crate::svn::revert(workspace, &[child.clone()])
                    .await
                    .unwrap();
                let escaped_dir = format!("{}@", wc.join(dir).to_string_lossy());
                run(&["update", "--set-depth", "empty", &escaped_dir]);
                assert!(restore_file_revision(workspace, dir, 1).await.is_err());
                run(&["update", "--set-depth", "infinity", &escaped_dir]);
                assert!(restore_file_revision(workspace, dir, 99999).await.is_err());
                restore_file_revision(workspace, dir, 1).await.unwrap();
                assert_eq!(fs::read_to_string(wc.join(&child)).unwrap(), "old content");
                assert_eq!(
                    fs::read_to_string(wc.join(dir).join("old.txt")).unwrap(),
                    "restore me"
                );
                assert!(!wc.join(dir).join("new.txt").exists());
                assert_eq!(
                    fs::read_to_string(wc.join("sibling.txt")).unwrap(),
                    "new sibling"
                );
                let details = property_details(workspace, dir).await.unwrap();
                assert_eq!(details.info.unwrap().revision, 2);
                assert!(!details
                    .properties
                    .iter()
                    .any(|p| p.name == "test:directory"));
                assert!(property_details(workspace, &child)
                    .await
                    .unwrap()
                    .properties
                    .is_empty());
                let statuses = crate::svn::status(workspace).await.unwrap();
                assert!(statuses
                    .iter()
                    .any(|e| e.path == format!("{dir}/old.txt") && e.status_code == "added"));
                assert!(statuses
                    .iter()
                    .any(|e| e.path == format!("{dir}/new.txt") && e.status_code == "deleted"));
                assert!(!statuses.iter().any(|e| e.path == "sibling.txt"));
                // The same operation also supports the working-copy root.
                run(&["revert", "--depth", "infinity", workspace]);
                restore_file_revision(workspace, ".", 1).await.unwrap();
                assert_eq!(
                    fs::read_to_string(wc.join("sibling.txt")).unwrap(),
                    "old sibling"
                );
            });
    }

    #[test]
    fn edits_real_working_copy_properties_without_recursing() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let id = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos();
                let root = std::env::temp_dir()
                    .join(format!("orca-properties-{}-{id}", std::process::id()));
                fs::create_dir_all(&root).unwrap();
                struct Cleanup(PathBuf);
                impl Drop for Cleanup {
                    fn drop(&mut self) {
                        let _ = fs::remove_dir_all(&self.0);
                    }
                }
                let _cleanup = Cleanup(root.clone());
                let repository = root.join("repo");
                assert!(Command::new("svnadmin")
                    .arg("create")
                    .arg(&repository)
                    .status()
                    .unwrap()
                    .success());
                let workspace = root.join("wc");
                assert!(Command::new("svn")
                    .args(["checkout", "--quiet"])
                    .arg(format!(
                        "file:///{}",
                        repository
                            .to_string_lossy()
                            .replace('\\', "/")
                            .trim_start_matches('/')
                    ))
                    .arg(&workspace)
                    .status()
                    .unwrap()
                    .success());
                let wc = workspace.to_str().unwrap();
                #[cfg(unix)]
                {
                    use std::os::unix::fs::symlink;
                    let outside = fs::canonicalize(&root).unwrap();
                    symlink(&outside, workspace.join("outside")).unwrap();
                    symlink("missing-target", workspace.join("broken")).unwrap();
                    symlink(&outside, root.join("another-link")).unwrap();
                    for (file, expected) in [
                        ("outside", outside.to_string_lossy().into_owned()),
                        ("broken", "missing-target".to_string()),
                    ] {
                        let details = property_details(wc, file).await.unwrap();
                        assert_eq!(details.link_target.as_deref(), Some(expected.as_str()));
                        assert!(details.info.is_none());
                        assert!(!details.directory);
                        assert!(!details.editable);
                        assert!(workspace_children(wc, file).is_err());
                        assert!(set_property(wc, file, "test:blocked", Some("value"))
                            .await
                            .is_err());
                    }
                    // Allowing inspection of the final link must not allow traversal
                    // through a link in a parent component, even to another link.
                    assert!(property_details(wc, "outside/another-link").await.is_err());
                    assert!(property_details(wc, "outside/repo").await.is_err());
                    assert!(property_details(wc, "../another-link").await.is_err());
                    let children = workspace_children(wc, ".").unwrap();
                    assert!(
                        !children
                            .iter()
                            .find(|child| child.name == "outside")
                            .unwrap()
                            .expandable
                    );
                    // Versioned links retain SVN metadata and their stored link path.
                    symlink("../repo", workspace.join("versioned-link")).unwrap();
                    assert!(Command::new("svn")
                        .args(["add", "versioned-link"])
                        .current_dir(&workspace)
                        .status()
                        .unwrap()
                        .success());
                    let details = property_details(wc, "versioned-link").await.unwrap();
                    assert_eq!(details.link_target.as_deref(), Some("../repo"));
                    assert_eq!(details.info.unwrap().schedule, "add");
                    assert!(!details.editable);
                }
                fs::create_dir(workspace.join("dir")).unwrap();
                fs::write(workspace.join("dir/file@测试.txt"), "one\ntwo\n").unwrap();
                assert!(Command::new("svn")
                    .args(["add", "dir"])
                    .current_dir(&workspace)
                    .status()
                    .unwrap()
                    .success());
                assert!(Command::new("svn")
                    .args(["commit", "-m", "initial", "--quiet"])
                    .current_dir(&workspace)
                    .status()
                    .unwrap()
                    .success());
                let file = "dir/file@测试.txt";
                set_property(wc, file, "test:custom", Some("--literal\n中文 & value\n"))
                    .await
                    .unwrap();
                set_property(wc, file, "test:empty", Some(""))
                    .await
                    .unwrap();
                set_property(wc, file, "svn:eol-style", Some("LF"))
                    .await
                    .unwrap();
                set_property(wc, file, "svn:executable", Some("*"))
                    .await
                    .unwrap();
                set_property(wc, file, "test:wildcard", Some("*"))
                    .await
                    .unwrap();
                let details = property_details(wc, file).await.unwrap();
                assert_eq!(
                    details
                        .properties
                        .iter()
                        .find(|p| p.name == "test:wildcard")
                        .unwrap()
                        .value,
                    "*"
                );
                assert!(details.editable);
                assert!(!details.directory);
                assert_eq!(details.size, Some(8));
                assert_eq!(details.info.unwrap().revision, 1);
                assert_eq!(
                    details
                        .properties
                        .iter()
                        .find(|p| p.name == "test:custom")
                        .unwrap()
                        .value,
                    "--literal\n中文 & value\n"
                );
                assert_eq!(
                    details
                        .properties
                        .iter()
                        .find(|p| p.name == "test:empty")
                        .unwrap()
                        .value,
                    ""
                );
                set_property(wc, file, "test:custom", None).await.unwrap();
                set_property(wc, "dir", "svn:ignore", Some("*.log\ncache"))
                    .await
                    .unwrap();
                let directory = property_details(wc, "dir").await.unwrap();
                assert!(directory.directory);
                assert_eq!(directory.properties.len(), 1);
                assert!(!property_details(wc, file)
                    .await
                    .unwrap()
                    .properties
                    .iter()
                    .any(|p| p.name == "svn:ignore" || p.name == "test:custom"));
                fs::write(workspace.join("loose.txt"), "unversioned").unwrap();
                let loose = property_details(wc, "loose.txt").await.unwrap();
                assert!(!loose.editable);
                assert!(loose.info.is_none());
                assert!(set_property(wc, "../repo", "test:escape", Some("x"))
                    .await
                    .is_err());
                assert!(set_property(wc, file, "bad name", Some("x")).await.is_err());
                // Restore an older file revision as a local change, including properties.
                fs::write(workspace.join(file), "new revision\n").unwrap();
                set_property(wc, file, "test:restored", Some("new"))
                    .await
                    .unwrap();
                assert!(Command::new("svn")
                    .args(["commit", "-m", "second", "--quiet"])
                    .current_dir(&workspace)
                    .status()
                    .unwrap()
                    .success());
                assert!(restore_file_revision(wc, file, 0).await.is_err());
                assert!(restore_file_revision(wc, "../repo", 1).await.is_err());
                assert!(restore_file_revision(wc, "loose.txt", 1).await.is_err());
                fs::write(workspace.join(file), "uncommitted\n").unwrap();
                assert!(restore_file_revision(wc, file, 1).await.is_err());
                assert_eq!(
                    fs::read_to_string(workspace.join(file)).unwrap(),
                    "uncommitted\n"
                );
                super::super::operations::revert(wc, &[file.into()])
                    .await
                    .unwrap();
                assert!(restore_file_revision(wc, file, 99999).await.is_err());
                assert_eq!(
                    fs::read_to_string(workspace.join(file)).unwrap(),
                    "new revision\n"
                );
                restore_file_revision(wc, file, 1).await.unwrap();
                assert_eq!(
                    fs::read_to_string(workspace.join(file)).unwrap(),
                    "one\ntwo\n"
                );
                let restored = property_details(wc, file).await.unwrap();
                assert_eq!(restored.info.unwrap().revision, 2);
                assert!(restored.properties.is_empty());
                let statuses = super::super::operations::status(wc).await.unwrap();
                assert!(statuses.iter().any(|entry| entry.path == file
                    && entry.status_code == "modified"
                    && entry.prop_status == "modified"));
                assert_eq!(
                    property_details(wc, "dir").await.unwrap().properties[0].value,
                    "*.log\ncache\n"
                );
                let repository_content =
                    execute_svn(&["cat", "-r", "HEAD", "--", "dir/file@测试.txt@"], Some(wc))
                        .await
                        .unwrap();
                assert_eq!(repository_content, "new revision\n");
                assert!(Command::new("svn")
                    .args(["delete", "--force", "--", "dir/file@测试.txt@"])
                    .current_dir(&workspace)
                    .status()
                    .unwrap()
                    .success());
                assert!(!property_details(wc, file).await.unwrap().editable);
            });
    }
}
