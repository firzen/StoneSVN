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
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub editable: bool,
    pub properties: Vec<SvnProperty>,
}

fn target_path(workspace: &str, file: &str) -> Result<PathBuf, SvnError> {
    let root = fs::canonicalize(workspace).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    let target = crate::resolve_workspace_child(&root, file).map_err(SvnError::InvalidArguments)?;
    // Check the nearest existing ancestor too, including symlinked directories.
    let mut ancestor = target.as_path();
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
        // Symlinks remain leaf nodes, so directory links cannot form cycles.
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
            directory: kind.is_dir(),
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

fn parse_properties(xml: &str) -> Result<Vec<SvnProperty>, SvnError> {
    let mut reader = Reader::from_str(xml);
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
    let target = target_path(workspace, file)?;
    let metadata = fs::symlink_metadata(&target).ok();
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
    let editable =
        info.as_ref().is_some_and(|info| info.schedule != "delete") && metadata.is_some();
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
        editable,
        properties,
        size: metadata.as_ref().filter(|m| m.is_file()).map(|m| m.len()),
        modified: metadata
            .and_then(|m| m.modified().ok())
            .map(|time| chrono::DateTime::<chrono::Local>::from(time).to_rfc3339()),
    })
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
    // A leading dash in a name or value must not become an SVN option.
    let args = match value {
        Some(value) => vec!["propset", "--", name, value, &target],
        None => vec!["propdel", "--", name, &target],
    };
    execute_svn(&args, Some(workspace)).await?;
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
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.parent().unwrap(), root.join("outside")).unwrap();
            let children = workspace_children(workspace, ".").unwrap();
            assert!(
                !children
                    .iter()
                    .find(|child| child.name == "outside")
                    .unwrap()
                    .directory
            );
            assert!(workspace_children(workspace, "outside").is_err());
        }
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
                    .arg(format!("file://{}", repository.display()))
                    .arg(&workspace)
                    .status()
                    .unwrap()
                    .success());
                let wc = workspace.to_str().unwrap();
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
                let details = property_details(wc, file).await.unwrap();
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
