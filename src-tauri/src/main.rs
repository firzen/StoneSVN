#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod svn;
mod system_icons;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum OpenTarget {
    Explorer,
    Vscode,
    Terminal,
}

/// Workspace directory passed on the command line, e.g. `stonesvn <path>`.
#[tauri::command]
fn launch_workspace_path() -> Option<String> {
    launch_workspace_arg(
        env::args_os().skip(1).map(PathBuf::from),
        &env::current_dir().ok()?,
    )
}

fn launch_workspace_arg(args: impl Iterator<Item = PathBuf>, cwd: &Path) -> Option<String> {
    let arg = args
        .into_iter()
        .find(|arg| !arg.to_string_lossy().starts_with('-'))?;
    let path = fs::canonicalize(cwd.join(arg)).ok()?;
    if !path.is_dir() {
        return None;
    }
    let path = path.to_string_lossy().into_owned();
    Some(
        path.strip_prefix(r"\\?\")
            .map(str::to_string)
            .unwrap_or(path),
    )
}

#[tauri::command]
async fn configure_svn_executable(executable: Option<String>) -> Result<String, String> {
    svn::configure_svn_executable(executable.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn configure_svn_server_security(
    app: tauri::AppHandle,
    server: String,
    legacy_tls: bool,
    trust_invalid_certificates: bool,
) -> Result<String, String> {
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    svn::configure_server_security(&server, legacy_tls, trust_invalid_certificates, &directory)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_connection_info(target: String) -> Result<SvnInfo, String> {
    svn::connection_info(&target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_workspace_target(path: String, target: OpenTarget) -> Result<(), String> {
    match target {
        OpenTarget::Explorer => open_file_manager(&path),
        OpenTarget::Vscode => {
            let mut code_command = Command::new("code");
            code_command.arg(&path);
            if spawn_command(code_command).is_ok() {
                return Ok(());
            }

            for executable in vscode_candidates() {
                let mut command = Command::new(executable);
                command.arg(&path);
                if spawn_command(command).is_ok() {
                    return Ok(());
                }
            }

            #[cfg(target_os = "macos")]
            {
                let mut command = Command::new("open");
                command.args(["-a", "Visual Studio Code", &path]);
                if spawn_command(command).is_ok() {
                    return Ok(());
                }
            }

            Err("failed to open workspace: VS Code executable was not found".to_string())
        }
        OpenTarget::Terminal => open_terminal(&path),
    }
}

fn open_file_manager(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");

    command.arg(path);
    spawn_command(command)
}

#[tauri::command]
async fn reveal_workspace_file(path: String, file: String) -> Result<(), String> {
    let workspace = fs::canonicalize(&path).map_err(|e| format!("invalid workspace path: {e}"))?;
    let target = resolve_workspace_child(&workspace, &file)?;

    #[cfg(target_os = "windows")]
    {
        let reveal_target = if target.exists() {
            target
        } else {
            target.parent().unwrap_or(&workspace).to_path_buf()
        };
        let mut command = Command::new("explorer");
        if reveal_target.is_file() {
            command.arg(format!("/select,{}", reveal_target.display()));
        } else {
            command.arg(reveal_target);
        }
        return spawn_command(command);
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        if target.exists() {
            command.arg("-R").arg(target);
        } else {
            command.arg(target.parent().unwrap_or(&workspace));
        }
        return spawn_command(command);
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let directory = if target.is_dir() {
            target.as_path()
        } else {
            target.parent().unwrap_or(&workspace)
        };
        let mut command = Command::new("xdg-open");
        command.arg(directory);
        spawn_command(command)
    }
}

#[tauri::command]
async fn open_workspace_file(path: String, file: String) -> Result<(), String> {
    let workspace = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let target = resolve_workspace_child(&workspace, &file)?;
    let target = fs::canonicalize(target).map_err(|e| e.to_string())?;
    if !target.starts_with(&workspace) {
        return Err("file must be inside the workspace".to_string());
    }
    open_file_manager(target.to_str().ok_or("invalid file path")?)
}

fn spawn_command(mut command: Command) -> Result<(), String> {
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to open workspace: {e}"))
}

#[tauri::command]
async fn delete_unversioned(path: String, files: Vec<String>) -> Result<CommandResult, String> {
    let workspace = fs::canonicalize(&path).map_err(|e| format!("invalid workspace path: {e}"))?;
    let mut removed = Vec::new();

    for file in files {
        let target = resolve_workspace_child(&workspace, &file)?;
        // Validate the parent without following the selected link. This also
        // permits deleting dangling links and links pointing outside the WC.
        let parent = fs::canonicalize(target.parent().ok_or("invalid delete path")?)
            .map_err(|e| format!("failed to resolve parent for '{file}': {e}"))?;
        if !parent.starts_with(&workspace) || target == workspace {
            return Err(format!("refusing to delete outside workspace: {file}"));
        }
        let metadata = fs::symlink_metadata(&target)
            .map_err(|e| format!("failed to inspect file '{file}': {e}"))?;
        if metadata.file_type().is_symlink() {
            // Windows directory links must be removed with remove_dir.
            #[cfg(windows)]
            let result = {
                use std::os::windows::fs::FileTypeExt;
                if metadata.file_type().is_symlink_dir() {
                    fs::remove_dir(&target)
                } else {
                    fs::remove_file(&target)
                }
            };
            #[cfg(not(windows))]
            let result = fs::remove_file(&target);
            result.map_err(|e| format!("failed to delete link '{file}': {e}"))?;
            removed.push(file);
            continue;
        }

        let canonical_target = fs::canonicalize(&target)
            .map_err(|e| format!("failed to resolve file path '{file}': {e}"))?;
        if !canonical_target.starts_with(&workspace) {
            return Err(format!("refusing to delete outside workspace: {file}"));
        }

        if canonical_target.is_dir() {
            fs::remove_dir_all(&canonical_target)
                .map_err(|e| format!("failed to delete directory '{file}': {e}"))?;
        } else {
            fs::remove_file(&canonical_target)
                .map_err(|e| format!("failed to delete file '{file}': {e}"))?;
        }
        removed.push(file);
    }

    Ok(CommandResult {
        success: true,
        output: removed.join("\n"),
        error: None,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StashUnversionedEntry {
    path: String,
    kind: String,
    content_base64: Option<String>,
}

// Entries are persisted in WebView local storage. Keep enough headroom for
// base64 expansion, existing patches, and storage-engine bookkeeping.
const MAX_UNVERSIONED_STASH_BYTES: u64 = 2 * 1024 * 1024;

fn collect_unversioned_entry(
    workspace: &Path,
    target: &Path,
    entries: &mut Vec<StashUnversionedEntry>,
    total_bytes: &mut u64,
) -> Result<(), String> {
    let metadata = fs::symlink_metadata(target).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "symbolic links are not supported: {}",
            target.display()
        ));
    }
    let relative = target.strip_prefix(workspace).map_err(|e| e.to_string())?;
    let path = relative.to_string_lossy().replace('\\', "/");
    if metadata.is_dir() {
        entries.push(StashUnversionedEntry {
            path,
            kind: "directory".to_string(),
            content_base64: None,
        });
        let mut children = fs::read_dir(target)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        children.sort_by_key(|entry| entry.file_name());
        for child in children {
            collect_unversioned_entry(workspace, &child.path(), entries, total_bytes)?;
        }
    } else {
        *total_bytes = total_bytes.saturating_add(metadata.len());
        if *total_bytes > MAX_UNVERSIONED_STASH_BYTES {
            return Err("unversioned files exceed the 2 MB stash limit".to_string());
        }
        let content = fs::read(target).map_err(|e| e.to_string())?;
        entries.push(StashUnversionedEntry {
            path,
            kind: "file".to_string(),
            content_base64: Some(BASE64_STANDARD.encode(content)),
        });
    }
    Ok(())
}

#[tauri::command]
async fn read_unversioned_files(
    path: String,
    files: Vec<String>,
) -> Result<Vec<StashUnversionedEntry>, String> {
    let workspace = fs::canonicalize(&path).map_err(|e| format!("invalid workspace path: {e}"))?;
    let statuses = svn::status(&path).await.map_err(|e| e.to_string())?;
    let unversioned: std::collections::HashSet<String> = statuses
        .into_iter()
        .filter(|status| status.status_code == "unversioned")
        .map(|status| status.path.replace('\\', "/"))
        .collect();
    let mut entries = Vec::new();
    let mut total_bytes = 0;
    for file in files {
        let normalized = file.replace('\\', "/");
        if !unversioned.contains(&normalized) {
            return Err(format!("path is not unversioned: {file}"));
        }
        let target = resolve_workspace_child(&workspace, &file)?;
        if fs::symlink_metadata(&target)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err(format!("symbolic links are not supported: {file}"));
        }
        let canonical = fs::canonicalize(&target).map_err(|e| e.to_string())?;
        if !canonical.starts_with(&workspace) {
            return Err(format!("refusing to read outside workspace: {file}"));
        }
        collect_unversioned_entry(&workspace, &canonical, &mut entries, &mut total_bytes)?;
    }
    Ok(entries)
}

fn validate_restore_target(workspace: &Path, target: &Path) -> Result<(), String> {
    let mut existing_parent = target
        .parent()
        .ok_or_else(|| "invalid restore path".to_string())?;
    while !existing_parent.exists() {
        existing_parent = existing_parent
            .parent()
            .ok_or_else(|| "invalid restore path".to_string())?;
    }
    let canonical_parent = fs::canonicalize(existing_parent).map_err(|e| e.to_string())?;
    if !canonical_parent.starts_with(workspace) {
        return Err(format!(
            "refusing to restore outside workspace: {}",
            target.display()
        ));
    }
    Ok(())
}

#[tauri::command]
async fn restore_unversioned_files(
    path: String,
    files: Vec<StashUnversionedEntry>,
    dry_run: bool,
) -> Result<(), String> {
    let workspace = fs::canonicalize(&path).map_err(|e| format!("invalid workspace path: {e}"))?;
    if files.is_empty() {
        return Ok(());
    }

    let mut resolved = Vec::with_capacity(files.len());
    for entry in &files {
        if entry.kind != "file" && entry.kind != "directory" {
            return Err(format!("invalid stored entry kind: {}", entry.kind));
        }
        if entry.kind == "file" && entry.content_base64.is_none() {
            return Err(format!("stored file has no content: {}", entry.path));
        }
        let target = resolve_workspace_child(&workspace, &entry.path)?;
        validate_restore_target(&workspace, &target)?;
        if target.exists() {
            return Err(format!(
                "cannot restore because the path already exists: {}",
                entry.path
            ));
        }
        resolved.push((entry, target));
    }
    if dry_run {
        return Ok(());
    }

    resolved.sort_by_key(|(_, target)| target.components().count());
    for (entry, target) in resolved {
        if entry.kind == "directory" {
            fs::create_dir_all(&target)
                .map_err(|e| format!("failed to restore directory '{}': {e}", entry.path))?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let encoded = entry.content_base64.as_deref().unwrap_or_default();
            let content = BASE64_STANDARD
                .decode(encoded)
                .map_err(|e| format!("invalid stored content for '{}': {e}", entry.path))?;
            fs::write(&target, content)
                .map_err(|e| format!("failed to restore file '{}': {e}", entry.path))?;
        }
    }
    Ok(())
}

fn resolve_workspace_child(workspace: &Path, file: &str) -> Result<PathBuf, String> {
    let relative = Path::new(file);
    if relative.is_absolute() {
        return Err(format!("absolute paths are not allowed: {file}"));
    }

    let mut target = workspace.to_path_buf();
    for component in relative.components() {
        match component {
            Component::Normal(part) => target.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("invalid path outside workspace: {file}"));
            }
        }
    }

    Ok(target)
}

fn vscode_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        candidates
            .push(PathBuf::from(&local_app_data).join("Programs\\Microsoft VS Code\\Code.exe"));
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe"),
        );
    }

    if let Ok(program_files) = env::var("ProgramFiles") {
        candidates.push(PathBuf::from(&program_files).join("Microsoft VS Code\\Code.exe"));
        candidates.push(
            PathBuf::from(&program_files).join("Microsoft VS Code Insiders\\Code - Insiders.exe"),
        );
    }

    if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(&program_files_x86).join("Microsoft VS Code\\Code.exe"));
        candidates.push(
            PathBuf::from(&program_files_x86)
                .join("Microsoft VS Code Insiders\\Code - Insiders.exe"),
        );
    }

    candidates
}

#[cfg(target_os = "windows")]
fn open_terminal(path: &str) -> Result<(), String> {
    let workspace = PathBuf::from(path);
    let mut errors = Vec::new();

    let mut windows_terminal = Command::new("wt");
    windows_terminal.args(["-d", path]);
    match spawn_command(windows_terminal) {
        Ok(()) => return Ok(()),
        Err(error) => errors.push(format!("wt: {error}")),
    }

    let mut pwsh = Command::new("pwsh");
    pwsh.arg("-NoExit").current_dir(&workspace);
    match spawn_command(pwsh) {
        Ok(()) => return Ok(()),
        Err(error) => errors.push(format!("pwsh: {error}")),
    }

    let mut powershell = Command::new("powershell");
    powershell.arg("-NoExit").current_dir(&workspace);
    match spawn_command(powershell) {
        Ok(()) => return Ok(()),
        Err(error) => errors.push(format!("powershell: {error}")),
    }

    let mut cmd = Command::new("cmd");
    cmd.arg("/K").current_dir(&workspace);
    match spawn_command(cmd) {
        Ok(()) => Ok(()),
        Err(error) => {
            errors.push(format!("cmd: {error}"));
            Err(format!("failed to open terminal: {}", errors.join("; ")))
        }
    }
}

#[cfg(target_os = "macos")]
fn open_terminal(path: &str) -> Result<(), String> {
    let mut command = Command::new("open");
    command.args(["-a", "Terminal", path]);
    spawn_command(command)
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_terminal(path: &str) -> Result<(), String> {
    let candidates: [(&str, &[&str]); 4] = [
        ("x-terminal-emulator", &["--working-directory", path]),
        ("gnome-terminal", &["--working-directory", path]),
        ("konsole", &["--workdir", path]),
        ("xfce4-terminal", &["--working-directory", path]),
    ];
    let mut errors = Vec::new();
    for (executable, args) in candidates {
        let mut command = Command::new(executable);
        command.args(args);
        match spawn_command(command) {
            Ok(()) => return Ok(()),
            Err(error) => errors.push(format!("{executable}: {error}")),
        }
    }
    Err(format!("failed to open terminal: {}", errors.join("; ")))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvnStatus {
    pub path: String,
    #[serde(default)]
    pub directory: bool,
    pub status: String,
    pub status_code: String,
    pub prop_status: String,
    pub locked: bool,
    pub history: bool,
    pub switched: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvnLogEntry {
    pub revision: u64,
    pub author: String,
    pub date: String,
    pub message: String,
    pub changed_paths: Vec<SvnLogPath>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvnLogPath {
    pub path: String,
    pub action: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvnInfo {
    pub path: String,
    pub url: String,
    pub repository_root: String,
    pub revision: u64,
    pub node_kind: String,
    pub schedule: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvnAuthUser {
    pub username: String,
    pub realm: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffResult {
    pub path: String,
    pub diff: String,
    pub old_revision: u64,
    pub new_revision: u64,
}

#[tauri::command]
async fn svn_checkout(
    url: String,
    path: String,
    revision: Option<u64>,
) -> Result<CommandResult, String> {
    svn::checkout(&url, &path, revision)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_update(path: String, revision: Option<u64>) -> Result<CommandResult, String> {
    svn::update(&path, revision)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_commit(
    path: String,
    message: String,
    files: Option<Vec<String>>,
    filter_rules: Option<Vec<String>>,
) -> Result<CommandResult, String> {
    let filter = svn::FileFilter::new(filter_rules.as_deref().unwrap_or_default());
    if !filter.is_empty() && files.is_none() {
        return Err("过滤已启用，提交时必须明确选择文件".to_string());
    }
    filter
        .validate_targets(files.as_deref().unwrap_or_default())
        .map_err(|error| error.to_string())?;
    svn::commit(&path, &message, files.as_deref())
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_status(
    app: tauri::AppHandle,
    path: String,
    force: Option<bool>,
) -> Result<Vec<SvnStatus>, String> {
    svn::cached_status(
        &path,
        force.unwrap_or(false),
        app.path()
            .app_cache_dir()
            .ok()
            .map(|path| path.join("workspace-status")),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_log(
    path: String,
    file: Option<String>,
    limit: Option<u32>,
    start_rev: Option<u64>,
    end_rev: Option<u64>,
    keyword: Option<String>,
    author: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<SvnLogEntry>, String> {
    if let Some(file) = file {
        return svn::file_log(&path, &file, limit, start_rev)
            .await
            .map_err(|e| e.to_string());
    }
    svn::log(
        &path,
        limit,
        start_rev,
        end_rev,
        keyword.as_deref(),
        author.as_deref(),
        date_from.as_deref(),
        date_to.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_current_user(path: String) -> Result<Option<SvnAuthUser>, String> {
    svn::current_user(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_info(path: String) -> Result<SvnInfo, String> {
    svn::info(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn workspace_children(
    path: String,
    directory: String,
) -> Result<Vec<svn::WorkspaceChild>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        svn::workspace_children(&path, &directory).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn svn_property_details(path: String, file: String) -> Result<svn::PropertyDetails, String> {
    svn::property_details(&path, &file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn workspace_search(path: String, query: String) -> Result<Vec<svn::WorkspaceChild>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        svn::workspace_search(&path, &query).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn svn_set_property(
    path: String,
    file: String,
    name: String,
    value: Option<String>,
) -> Result<(), String> {
    svn::set_property(&path, &file, &name, value.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_local_revision(path: String) -> Result<u64, String> {
    svn::local_revision(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_remote_info(path: String) -> Result<SvnInfo, String> {
    svn::remote_info(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_file_preview(
    workspace_path: String,
    file: String,
    old_rev: Option<u64>,
    new_rev: Option<u64>,
) -> Result<svn::FilePreviewResult, String> {
    svn::file_preview(&workspace_path, &file, old_rev, new_rev)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_diff(
    workspace_path: String,
    file: String,
    old_rev: Option<u64>,
    new_rev: Option<u64>,
) -> Result<DiffResult, String> {
    svn::diff(&workspace_path, &file, old_rev, new_rev)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_apply_patch(
    workspace_path: String,
    patch: String,
    reverse: bool,
) -> Result<CommandResult, String> {
    svn::apply_patch(&workspace_path, &patch, reverse)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_blame(workspace_path: String, file: String) -> Result<Vec<svn::BlameLine>, String> {
    svn::blame(&workspace_path, &file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_export(
    path: String,
    file: String,
    destination: String,
) -> Result<CommandResult, String> {
    svn::export(&path, &file, &destination)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_add(
    path: String,
    files: Vec<String>,
    filter_rules: Option<Vec<String>>,
) -> Result<CommandResult, String> {
    let filter = svn::FileFilter::new(filter_rules.as_deref().unwrap_or_default());
    filter
        .validate_add(&path, &files)
        .map_err(|error| error.to_string())?;
    svn::add(&path, &files)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_cancel_add(path: String, file: String) -> Result<CommandResult, String> {
    svn::cancel_add(&path, &file)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_delete(path: String, files: Vec<String>) -> Result<CommandResult, String> {
    svn::delete(&path, &files)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_restore_file_revision(
    path: String,
    file: String,
    revision: u64,
) -> Result<CommandResult, String> {
    svn::restore_file_revision(&path, &file, revision)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_revert_preview(path: String, file: String) -> Result<Vec<SvnStatus>, String> {
    svn::revert_preview(&path, &file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_revert(
    path: String,
    files: Vec<String>,
    preview: Option<Vec<SvnStatus>>,
) -> Result<CommandResult, String> {
    svn::revert_reviewed(&path, &files, preview.as_deref())
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_resolve(
    path: String,
    files: Vec<String>,
    strategy: String,
) -> Result<CommandResult, String> {
    svn::resolve(&path, &files, &strategy)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_move(
    path: String,
    source: String,
    destination: String,
) -> Result<CommandResult, String> {
    svn::move_target(&path, &source, &destination)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_relocate(path: String, url: String) -> Result<CommandResult, String> {
    svn::relocate(&path, &url)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_cleanup(path: String) -> Result<CommandResult, String> {
    svn::cleanup(&path)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_switch(path: String, url: String) -> Result<CommandResult, String> {
    svn::switch_cmd(&path, &url)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn svn_merge(
    path: String,
    source: String,
    rev_start: u64,
    rev_end: u64,
) -> Result<CommandResult, String> {
    svn::merge(&path, &source, rev_start, rev_end)
        .await
        .map(|output| CommandResult {
            success: true,
            output,
            error: None,
        })
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod unversioned_stash_tests {
    use super::{collect_unversioned_entry, restore_unversioned_files};
    use std::fs;

    #[test]
    fn captures_and_restores_binary_files_and_empty_directories() {
        let root = std::env::temp_dir().join(format!(
            "orcasvn-unversioned-stash-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = root.join("new-dir");
        fs::create_dir_all(source.join("empty")).unwrap();
        fs::write(source.join("binary.dat"), [0, 1, 127, 255]).unwrap();

        let workspace = fs::canonicalize(&root).unwrap();
        let canonical_source = fs::canonicalize(&source).unwrap();
        let mut entries = Vec::new();
        let mut total_bytes = 0;
        collect_unversioned_entry(
            &workspace,
            &canonical_source,
            &mut entries,
            &mut total_bytes,
        )
        .unwrap();
        assert_eq!(total_bytes, 4);
        assert!(entries.iter().any(|entry| entry.path == "new-dir/empty"));

        fs::remove_dir_all(&source).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        runtime
            .block_on(restore_unversioned_files(
                root.to_string_lossy().into_owned(),
                entries.clone(),
                true,
            ))
            .unwrap();
        assert!(!source.exists());
        runtime
            .block_on(restore_unversioned_files(
                root.to_string_lossy().into_owned(),
                entries.clone(),
                false,
            ))
            .unwrap();
        assert_eq!(
            fs::read(source.join("binary.dat")).unwrap(),
            [0, 1, 127, 255]
        );
        assert!(source.join("empty").is_dir());
        assert!(runtime
            .block_on(restore_unversioned_files(
                root.to_string_lossy().into_owned(),
                entries,
                true,
            ))
            .is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}

#[cfg(test)]
#[cfg(unix)]
mod delete_link_tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn deletes_only_selected_links_and_rejects_paths_through_outside_parents() {
        let root = env::temp_dir().join(format!(
            "orcasvn-delete-links-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("wc/important-dir")).unwrap();
        fs::write(root.join("wc/important.txt"), "unsaved work").unwrap();
        fs::write(root.join("wc/important-dir/keep.txt"), "keep").unwrap();
        fs::write(root.join("outside.txt"), "outside").unwrap();
        let wc = root.join("wc");
        for (name, destination) in [
            ("file-link", "important.txt"),
            ("dir-link", "important-dir"),
            ("root-link", "."),
            ("dangling-link", "missing"),
            ("outside-link", "../outside.txt"),
        ] {
            symlink(destination, wc.join(name)).unwrap();
        }
        symlink("..", wc.join("outside-parent")).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        runtime.block_on(async {
            let path = wc.to_string_lossy().into_owned();
            for name in [
                "file-link",
                "dir-link",
                "root-link",
                "dangling-link",
                "outside-link",
            ] {
                delete_unversioned(path.clone(), vec![name.into()])
                    .await
                    .unwrap();
                assert!(fs::symlink_metadata(wc.join(name)).is_err());
            }
            assert!(
                delete_unversioned(path.clone(), vec!["outside-parent/outside.txt".into()])
                    .await
                    .is_err()
            );
            for name in ["", ".", "../outside.txt"] {
                assert!(delete_unversioned(path.clone(), vec![name.into()])
                    .await
                    .is_err());
            }
        });
        assert_eq!(
            fs::read_to_string(wc.join("important.txt")).unwrap(),
            "unsaved work"
        );
        assert_eq!(
            fs::read_to_string(wc.join("important-dir/keep.txt")).unwrap(),
            "keep"
        );
        assert_eq!(
            fs::read_to_string(root.join("outside.txt")).unwrap(),
            "outside"
        );
        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
mod launch_arg_tests {
    use super::launch_workspace_arg;
    use std::path::PathBuf;

    #[test]
    fn resolves_first_directory_argument_and_skips_flags() {
        let cwd = std::env::temp_dir();
        let expected = std::fs::canonicalize(&cwd).unwrap();
        let args = vec![PathBuf::from("-psn_0_123"), PathBuf::from(".")];
        let resolved = launch_workspace_arg(args.into_iter(), &cwd).unwrap();
        assert!(expected.to_string_lossy().ends_with(&resolved));
        assert!(launch_workspace_arg(std::iter::empty(), &cwd).is_none());
        assert!(
            launch_workspace_arg(vec![PathBuf::from("missing-orcasvn-dir")].into_iter(), &cwd)
                .is_none()
        );
    }
}

#[cfg(test)]
mod file_filter_tests {
    use super::{svn_add, svn_commit};
    use std::{fs, process::Command};

    #[test]
    fn filtered_commands_preserve_excluded_files_in_a_real_repository() {
        assert!(Command::new("svnadmin")
            .arg("--version")
            .output()
            .unwrap()
            .status
            .success());
        let temp = std::env::temp_dir().join(format!(
            "orcasvn-filter-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp).unwrap();
        let repository = temp.join("repo");
        let wc = temp.join("wc");
        assert!(Command::new("svnadmin")
            .arg("create")
            .arg(&repository)
            .output()
            .unwrap()
            .status
            .success());
        let url = format!(
            "file:///{}",
            repository
                .to_string_lossy()
                .replace('\\', "/")
                .trim_start_matches('/')
        );
        let run = |args: &[&str]| {
            let output = Command::new("svn")
                .args(args)
                .current_dir(if wc.exists() { &wc } else { &temp })
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8_lossy(&output.stdout).into_owned()
        };
        run(&["checkout", &url, wc.to_str().unwrap()]);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let workspace = wc.to_string_lossy().into_owned();
        let rules = Some(vec![".gitignore".into(), "*.log".into()]);
        fs::create_dir_all(wc.join("new/deep")).unwrap();
        fs::write(wc.join("new/deep/secret.log"), "local").unwrap();
        fs::write(wc.join("new/allowed.txt"), "allowed").unwrap();
        let before = run(&["status"]);
        let error = runtime
            .block_on(svn_add(
                workspace.clone(),
                vec!["new".into()],
                rules.clone(),
            ))
            .unwrap_err();
        assert!(error.contains("secret.log"));
        assert_eq!(run(&["status"]), before);
        runtime
            .block_on(svn_add(workspace.clone(), vec!["new".into()], None))
            .unwrap();
        runtime
            .block_on(svn_commit(workspace.clone(), "initial".into(), None, None))
            .unwrap();
        fs::write(wc.join("new/deep/secret.log"), "changed").unwrap();
        fs::write(wc.join("new/allowed.txt"), "changed").unwrap();
        run(&["propset", "test:filter", "changed", "new"]);
        // Reject a direct target and implicit whole-workspace commit.
        assert!(runtime
            .block_on(svn_commit(
                workspace.clone(),
                "blocked".into(),
                Some(vec!["new/deep/secret.log".into()]),
                rules.clone()
            ))
            .is_err());
        assert!(runtime
            .block_on(svn_commit(
                workspace.clone(),
                "blocked".into(),
                None,
                rules.clone()
            ))
            .is_err());
        // Directory property plus one file commits at depth empty.
        runtime
            .block_on(svn_commit(
                workspace.clone(),
                "allowed".into(),
                Some(vec!["new".into(), "new/allowed.txt".into()]),
                rules.clone(),
            ))
            .unwrap();
        assert_eq!(run(&["cat", "-r", "HEAD", "new/deep/secret.log"]), "local");
        assert_eq!(run(&["cat", "-r", "HEAD", "new/allowed.txt"]), "changed");
        assert!(run(&["status"]).contains("secret.log"));
        // Atomic operations cannot implicitly include a filtered descendant.
        run(&["update"]);
        run(&["delete", "--force", "new"]);
        assert!(runtime
            .block_on(svn_commit(
                workspace.clone(),
                "blocked deletion".into(),
                Some(vec![
                    "new".into(),
                    "new/allowed.txt".into(),
                    "new/deep".into()
                ]),
                rules.clone()
            ))
            .is_err());
        assert!(run(&["list", "-r", "HEAD", &url]).contains("new/"));
        run(&["revert", "--recursive", "new"]);
        run(&["copy", "new", "copy"]);
        assert!(runtime
            .block_on(svn_commit(
                workspace,
                "blocked copy".into(),
                Some(vec!["copy".into()]),
                rules
            ))
            .is_err());
        assert!(!run(&["list", "-r", "HEAD", &url]).contains("copy/"));
        fs::remove_dir_all(temp).unwrap();
    }
}

fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .on_window_event(|_window, _event| {
            // The source-debug launcher owns its dev server and watcher. On
            // macOS, closing the last window normally leaves the app running;
            // end this launcher-owned debug session so it can clean up too.
            #[cfg(debug_assertions)]
            if matches!(_event, tauri::WindowEvent::Destroyed)
                && _window.label() == "main"
                && env::var_os("STONESVN_DEV_LAUNCHER").is_some()
            {
                _window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            system_icons::file_type_icon,
            configure_svn_executable,
            configure_svn_server_security,
            svn_connection_info,
            launch_workspace_path,
            svn_checkout,
            svn_update,
            svn_commit,
            svn_status,
            svn_log,
            svn_current_user,
            svn_info,
            workspace_children,
            workspace_search,
            svn_property_details,
            svn_set_property,
            svn_local_revision,
            svn_remote_info,
            svn_diff,
            svn_file_preview,
            svn_apply_patch,
            svn_blame,
            svn_export,
            svn_add,
            svn_delete,
            svn_revert,
            svn_revert_preview,
            svn_cancel_add,
            svn_restore_file_revision,
            svn_resolve,
            svn_move,
            svn_relocate,
            svn_cleanup,
            svn_switch,
            svn_merge,
            open_workspace_target,
            reveal_workspace_file,
            open_workspace_file,
            delete_unversioned,
            read_unversioned_files,
            restore_unversioned_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
