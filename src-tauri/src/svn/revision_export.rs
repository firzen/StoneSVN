use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path};
use std::time::Duration;

use super::executor::{execute_svn_with_timeout, SvnError};
use super::operations::{info, log, normalize_svn_target, url_for_path};
use crate::SvnLogPath;

fn export_paths(paths: &[SvnLogPath]) -> Result<Vec<(&str, bool)>, SvnError> {
    let mut targets = Vec::new();
    let mut recursive = HashSet::new();
    for entry in paths {
        if entry.action == "D" || entry.path == "/" {
            continue;
        }
        let relative = entry.path.strip_prefix('/').unwrap_or(&entry.path);
        if relative.split('/').any(|part| {
            !matches!(
                Path::new(part).components().next(),
                Some(Component::Normal(name)) if name == part
            ) || part.eq_ignore_ascii_case(".svn")
                || part.contains('\\')
                || (cfg!(windows) && (part.contains(':') || part.ends_with([' ', '.'])))
        }) {
            return Err(SvnError::InvalidArguments(format!(
                "无法导出路径：{}",
                entry.path
            )));
        }
        let entire_node = matches!(entry.action.as_str(), "A" | "R");
        if entire_node {
            recursive.insert(relative);
        }
        targets.push((relative, entire_node));
    }
    // An added or replaced directory already contains its surviving descendants.
    targets.retain(|(relative, _)| {
        !relative
            .match_indices('/')
            .any(|(index, _)| recursive.contains(&relative[..index]))
    });
    // Export property-only directories before creating parents for their children.
    targets.sort_unstable_by_key(|(relative, _)| relative.matches('/').count());
    Ok(targets)
}

fn export_io_error(error: std::io::Error) -> SvnError {
    SvnError::CommandFailed(format!("无法写入导出目录：{error}"))
}

pub async fn export_revision(
    workspace: &str,
    revision: u64,
    destination: &str,
) -> Result<(), SvnError> {
    if revision == 0 {
        return Err(SvnError::InvalidArguments("请选择有效的 SVN 版本".into()));
    }
    let requested = Path::new(destination);
    let (Some(parent), Some(name)) = (requested.parent(), requested.file_name()) else {
        return Err(SvnError::InvalidArguments("请选择新目录的完整路径".into()));
    };
    if !requested.is_absolute() {
        return Err(SvnError::InvalidArguments("请选择新目录的完整路径".into()));
    }
    let parent = parent.canonicalize().map_err(export_io_error)?;
    let workspace_root = Path::new(workspace)
        .canonicalize()
        .map_err(export_io_error)?;
    if parent.starts_with(&workspace_root) {
        return Err(SvnError::InvalidArguments(
            "导出目录不能位于当前工作区内".into(),
        ));
    }

    let repository_root = info(workspace).await?.repository_root;
    let entries = log(
        workspace,
        Some(1),
        Some(revision),
        Some(revision),
        None,
        None,
        None,
        None,
    )
    .await?;
    let entry = entries
        .iter()
        .find(|entry| entry.revision == revision)
        .ok_or_else(|| SvnError::InvalidArguments(format!("未找到版本 r{revision}")))?;
    let targets = export_paths(&entry.changed_paths)?;
    if targets.is_empty()
        && !entry
            .changed_paths
            .iter()
            .any(|path| path.path == "/" && path.action != "D")
    {
        return Err(SvnError::InvalidArguments(
            "此版本没有可导出的文件或目录".into(),
        ));
    }

    let destination = parent.join(name);
    fs::create_dir(&destination).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            SvnError::InvalidArguments("导出目录已存在，请选择新的目录".into())
        } else {
            export_io_error(error)
        }
    })?;

    let result = async {
        let revision = revision.to_string();
        for (relative, entire_node) in targets {
            let source = format!("{}@{revision}", url_for_path(&repository_root, relative)?);
            let target = destination.join(relative);
            // Walk one component at a time so an exported symlink (including a
            // case-insensitive alias) cannot redirect a subsequent export.
            let mut parent = destination.clone();
            for component in Path::new(relative).parent().unwrap().iter() {
                parent.push(component);
                match fs::create_dir(&parent) {
                    Ok(()) => {}
                    Err(error)
                        if error.kind() == std::io::ErrorKind::AlreadyExists
                            && fs::symlink_metadata(&parent)
                                .is_ok_and(|metadata| metadata.is_dir()) => {}
                    Err(error) => return Err(export_io_error(error)),
                }
            }
            let target = normalize_svn_target(&target.to_string_lossy());
            let depth = if entire_node { "infinity" } else { "empty" };
            execute_svn_with_timeout(
                &[
                    "export",
                    "--ignore-externals",
                    "--depth",
                    depth,
                    "-r",
                    &revision,
                    "--",
                    &source,
                    &target,
                ],
                Some(workspace),
                Duration::from_secs(30 * 60),
            )
            .await?;
        }
        Ok(())
    }
    .await;
    if result.is_err() {
        if let Err(error) = fs::remove_dir_all(&destination) {
            tracing::warn!(%error, path = %destination.display(), "Failed to remove incomplete revision export");
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn revision_export_preserves_changed_paths_and_historical_contents() {
        let root = std::env::temp_dir().join(format!(
            "stonesvn-revision-export-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let repository = root.join("repo");
        let workspace = root.join("wc");
        assert!(Command::new("svnadmin")
            .arg("create")
            .arg(&repository)
            .status()
            .unwrap()
            .success());
        let url = tauri::Url::from_file_path(&repository).unwrap();
        let checkout = Command::new("svn")
            .args(["checkout", url.as_str()])
            .arg(&workspace)
            .output()
            .unwrap();
        assert!(checkout.status.success(), "{checkout:?}");
        let svn = |args: &[&str]| {
            let output = Command::new("svn")
                .args(args)
                .current_dir(&workspace)
                .output()
                .unwrap();
            assert!(output.status.success(), "{args:?} failed: {output:?}");
        };
        fs::create_dir(workspace.join("folder")).unwrap();
        fs::write(workspace.join("folder/测试@ %.txt"), "original").unwrap();
        fs::write(workspace.join("folder/unchanged"), "unchanged").unwrap();
        fs::write(workspace.join("folder/removed"), "removed later").unwrap();
        svn(&["add", "folder"]);
        svn(&["commit", "-m", "Initial"]);
        svn(&["update"]);
        fs::write(workspace.join("folder/测试@ %.txt"), "revision two").unwrap();
        svn(&["delete", "folder/removed"]);
        svn(&["propset", "custom", "value", "folder"]);
        svn(&["propset", "svn:externals", "^/folder external", "folder"]);
        svn(&["copy", "folder/unchanged", "copied"]);
        svn(&["copy", "folder", "copied-folder"]);
        svn(&["mkdir", "empty"]);
        svn(&["commit", "-m", "Subset"]);
        fs::write(workspace.join("folder/测试@ %.txt"), "local change").unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let run = |revision, destination: &Path| {
            runtime.block_on(export_revision(
                workspace.to_str().unwrap(),
                revision,
                destination.to_str().unwrap(),
            ))
        };
        let first = root.join("r1");
        run(1, &first).unwrap();
        assert_eq!(
            fs::read_to_string(first.join("folder/removed")).unwrap(),
            "removed later"
        );
        let second = root.join("r2@export");
        run(2, &second).unwrap();
        assert_eq!(
            fs::read_to_string(second.join("folder/测试@ %.txt")).unwrap(),
            "revision two"
        );
        assert_eq!(
            fs::read_to_string(second.join("copied")).unwrap(),
            "unchanged"
        );
        assert!(second.join("empty").is_dir());
        assert!(second.join("copied-folder/unchanged").is_file());
        assert!(!second.join("copied-folder/external").exists());
        for missing in [
            ".svn",
            "folder/.svn",
            "folder/unchanged",
            "folder/removed",
            "folder/external",
        ] {
            assert!(!second.join(missing).exists(), "{missing} was exported");
        }
        assert!(run(2, &second).is_err());
        assert!(second.join("copied").is_file());

        svn(&["delete", "copied"]);
        svn(&["commit", "-m", "Deletion only", "copied"]);
        let third = root.join("r3");
        assert!(run(3, &third).is_err());
        assert!(!third.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
