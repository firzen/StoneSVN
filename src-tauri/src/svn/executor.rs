use super::ssl_compat::{self, SslCompatibility};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;
use thiserror::Error;
use tokio::process::Command;
use tokio::time::timeout;

pub const SVN_TIMEOUT: Duration = Duration::from_secs(120);
static SVN_EXECUTABLE: OnceLock<RwLock<PathBuf>> = OnceLock::new();

#[derive(Error, Debug)]
pub enum SvnError {
    #[error("SVN 命令执行失败：{0}")]
    CommandFailed(String),
    #[error("SVN 未安装或不在 PATH 中")]
    SvnNotFound,
    #[error("解析输出失败：{0}")]
    ParseError(String),
    #[error("无效的 SVN 参数：{0}")]
    InvalidArguments(String),
    #[error("SVN 操作超时")]
    Timeout,
}

pub async fn execute_svn(args: &[&str], path: Option<&str>) -> Result<String, SvnError> {
    let executable = current_svn_executable()?;
    execute_svn_with_configurations(
        executable,
        args,
        path,
        ssl_compat::current_configurations()?,
    )
    .await
}

#[cfg(test)]
async fn execute_svn_with_configuration(
    executable: PathBuf,
    args: &[&str],
    path: Option<&str>,
    compatibility: Option<SslCompatibility>,
) -> Result<String, SvnError> {
    execute_svn_with_configurations(executable, args, path, compatibility.into_iter().collect())
        .await
}

async fn execute_svn_with_configurations(
    executable: PathBuf,
    args: &[&str],
    path: Option<&str>,
    mut configurations: Vec<SslCompatibility>,
) -> Result<String, SvnError> {
    // Remote status (-u) connects to the server and needs the same scoped TLS
    // settings as info/log. Only purely local scans skip the metadata query.
    let remote_status = args.first() == Some(&"status")
        && args
            .iter()
            .take_while(|arg| **arg != "--")
            .any(|arg| matches!(*arg, "-u" | "--show-updates"));
    let local_info = args.first() == Some(&"info")
        && !args.iter().take_while(|arg| **arg != "--").any(|arg| {
            matches!(*arg, "-r" | "--revision")
                || arg.starts_with("-r")
                || arg.starts_with("--revision=")
        })
        && ssl_compat::explicit_urls(args).is_empty();
    let local_status = args.first() == Some(&"status") && !remote_status;
    let local_working_diff = matches!(args, ["diff", "--", target] if !target.contains("://"));
    if local_working_diff
        || local_status
        || local_info
        || matches!(
            args.first(),
            Some(&"add" | &"revert" | &"resolve" | &"cleanup" | &"auth")
        )
    {
        configurations.clear();
    }
    let compatibility = if configurations.is_empty() {
        None
    } else {
        let urls = ssl_compat::explicit_urls(args);
        if !urls.is_empty() {
            configurations
                .into_iter()
                .find(|config| urls.iter().all(|url| config.matches(url)))
        } else if let Some(path) = path {
            // This metadata query is local, so even an old HTTPS server can be
            // identified before performing its first network request.
            let url = execute_svn_inner(
                executable.clone(),
                &["info", "--show-item", "repos-root-url", "--", "."],
                Some(path),
            )
            .await
            .ok();
            configurations
                .into_iter()
                .find(|config| url.as_ref().is_some_and(|url| config.matches(url.trim())))
        } else {
            None
        }
    };
    execute_svn_with_compatibility(executable, args, path, compatibility.as_ref()).await
}

pub async fn configure_svn_executable(executable: Option<&str>) -> Result<String, SvnError> {
    let candidates = svn_executable_candidates(executable, std::env::consts::OS, |key| {
        std::env::var_os(key)
    });
    let mut failure = SvnError::SvnNotFound;
    for candidate in candidates {
        // Missing fixed paths need no subprocess. Bound each probe so a broken
        // installation cannot hold the setup screen for the operation timeout.
        if candidate.is_absolute() && !candidate.is_file() {
            continue;
        }
        let probe = timeout(
            Duration::from_secs(3),
            execute_svn_inner(candidate.clone(), &["--version", "--quiet"], None),
        )
        .await
        .unwrap_or(Err(SvnError::Timeout));
        match probe {
            Ok(version) if valid_svn_version(&version) => {
                let mut configured = svn_executable_lock().write().map_err(|_| {
                    SvnError::CommandFailed("SVN 可执行文件配置锁已损坏".to_string())
                })?;
                *configured = candidate;
                return Ok(version.trim().to_string());
            }
            Ok(_) => failure = SvnError::CommandFailed("SVN 版本输出无效".to_string()),
            Err(error) => failure = error,
        }
    }
    Err(failure)
}

fn valid_svn_version(version: &str) -> bool {
    let core = version.trim().split('-').next().unwrap_or_default();
    let parts: Vec<_> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

fn svn_executable_candidates(
    executable: Option<&str>,
    platform: &str,
    env_value: impl Fn(&str) -> Option<std::ffi::OsString>,
) -> Vec<PathBuf> {
    let explicit = executable.map(str::trim).filter(|value| !value.is_empty());
    if explicit.is_some() {
        return vec![normalize_svn_executable(explicit)];
    }
    let mut candidates = vec![PathBuf::from("svn")];
    match platform {
        "macos" => candidates.extend(
            [
                "/opt/homebrew/bin/svn",
                "/usr/local/bin/svn",
                "/opt/local/bin/svn",
                "/usr/bin/svn",
            ]
            .map(PathBuf::from),
        ),
        "windows" => {
            for key in ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"] {
                if let Some(root) = env_value(key).filter(|value| !value.is_empty()) {
                    let root = PathBuf::from(root);
                    for relative in [
                        "SlikSvn/bin/svn.exe",
                        "TortoiseSVN/bin/svn.exe",
                        "VisualSVN/bin/svn.exe",
                        "CollabNet/Subversion Client/svn.exe",
                    ] {
                        candidates.push(root.join(relative));
                    }
                }
            }
            if let Some(root) = env_value("ChocolateyInstall").filter(|value| !value.is_empty()) {
                candidates.push(PathBuf::from(root).join("bin/svn.exe"));
            }
            if let Some(root) = env_value("USERPROFILE").filter(|value| !value.is_empty()) {
                let root = PathBuf::from(root);
                for relative in [
                    "scoop/shims/svn.exe",
                    "scoop/apps/subversion/current/bin/svn.exe",
                ] {
                    candidates.push(root.join(relative));
                }
            }
            if let Some(root) = env_value("LOCALAPPDATA").filter(|value| !value.is_empty()) {
                candidates.push(PathBuf::from(root).join("Programs/SlikSvn/bin/svn.exe"));
            }
        }
        _ => {
            candidates.extend(
                [
                    "/usr/bin/svn",
                    "/usr/local/bin/svn",
                    "/bin/svn",
                    "/snap/bin/svn",
                    "/opt/subversion/bin/svn",
                ]
                .map(PathBuf::from),
            );
            if let Some(home) = env_value("HOME").filter(|value| !value.is_empty()) {
                candidates.push(PathBuf::from(home).join(".local/bin/svn"));
            }
        }
    }
    let mut unique = Vec::new();
    for candidate in candidates {
        if !unique.contains(&candidate) {
            unique.push(candidate);
        }
    }
    unique
}

fn normalize_svn_executable(executable: Option<&str>) -> PathBuf {
    executable
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("svn"))
}

fn svn_executable_lock() -> &'static RwLock<PathBuf> {
    SVN_EXECUTABLE.get_or_init(|| RwLock::new(PathBuf::from("svn")))
}

pub(super) fn current_svn_executable() -> Result<PathBuf, SvnError> {
    svn_executable_lock()
        .read()
        .map(|path| path.clone())
        .map_err(|_| SvnError::CommandFailed("SVN 可执行文件配置锁已损坏".to_string()))
}

fn build_command_args(args: &[String]) -> Vec<String> {
    let mut command_args = vec!["--non-interactive".to_string()];
    command_args.extend(args.iter().cloned());
    command_args
}

async fn execute_svn_inner(
    executable: PathBuf,
    args: &[&str],
    path: Option<&str>,
) -> Result<String, SvnError> {
    execute_svn_with_compatibility(executable, args, path, None).await
}

async fn execute_svn_with_compatibility(
    executable: PathBuf,
    args: &[&str],
    path: Option<&str>,
    compatibility: Option<&SslCompatibility>,
) -> Result<String, SvnError> {
    let args_vec: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let mut cmd = Command::new(&executable);
    if let Some(config) = compatibility {
        config.apply(&mut cmd);
    }
    cmd.args(build_command_args(&args_vec));
    // SVN converts paths and messages using the process locale. Desktop launches
    // may inherit no locale, an ASCII locale, or a non-UTF-8 locale even though
    // Rust passes UTF-8 arguments. Override LC_ALL (which takes precedence over
    // LANG and LC_CTYPE) for the child only, keeping its output UTF-8 as well.
    #[cfg(unix)]
    {
        // macOS ships en_US.UTF-8; C.UTF-8 is available on Linux without
        // installing or generating an additional language locale.
        #[cfg(target_os = "macos")]
        const SVN_LOCALE: &str = "en_US.UTF-8";
        #[cfg(not(target_os = "macos"))]
        const SVN_LOCALE: &str = "C.UTF-8";
        cmd.env("LC_ALL", SVN_LOCALE);
    }
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    // Dropping the output future on timeout kills the child rather than leaving
    // an SVN process running. Tokio drains stdout and stderr concurrently.
    cmd.kill_on_drop(true);
    if let Some(path) = path {
        cmd.current_dir(path);
    }

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    collect_command_output(&mut cmd, SVN_TIMEOUT).await
}

async fn collect_command_output(cmd: &mut Command, deadline: Duration) -> Result<String, SvnError> {
    let output = timeout(deadline, cmd.output())
        .await
        .map_err(|_| SvnError::Timeout)?
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                SvnError::SvnNotFound
            } else {
                SvnError::CommandFailed(error.to_string())
            }
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = if stdout.trim_start().starts_with("<?xml") && !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            format!("{}\n{}", stdout.trim(), stderr.trim())
                .trim()
                .to_string()
        };
        Err(SvnError::CommandFailed(message))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[cfg(unix)]
    #[test]
    fn ssl_settings_are_scoped_to_matching_commands_and_do_not_change_parent_environment() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!(
            "orcasvn-ssl-scope-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let executable = root.join("svn");
        std::fs::write(&executable, "#!/bin/sh\nprintf 'call\\n' >> \"$0.calls\"\nfor arg in \"$@\"; do\nif [ \"$arg\" = --show-item ]; then echo https://legacy.example:8443/svn/repo; exit 0; fi\ndone\nprintf '%s\\n' \"${OPENSSL_CONF-unset}\" \"$@\"\n").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        let config = SslCompatibility::new("legacy.example:8443", true, &root).unwrap();
        let parent_env = std::env::var_os("OPENSSL_CONF");
        let normal_env = parent_env
            .as_ref()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unset".into());
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            for args in [
                vec!["checkout", "https://legacy.example:8443/svn/repo", "wc"],
                vec!["log", "--xml"],
                vec!["status", "--xml", "--show-updates", "--", "."],
                vec!["status", "-u", "--", "."],
            ] {
                let output = execute_svn_with_configuration(
                    executable.clone(),
                    &args,
                    Some(root.to_str().unwrap()),
                    Some(config.clone()),
                )
                .await
                .unwrap();
                assert_eq!(
                    output.lines().next().unwrap(),
                    root.join("legacy-tls.cnf").to_str().unwrap()
                );
                assert!(
                    output.contains("--trust-server-cert-failures=unknown-ca,cn-mismatch,expired")
                );
            }
            for args in [
                vec!["info", "--show-item", "revision"],
                vec!["info", "--xml", "--depth", "infinity", "--", "."],
            ] {
                let count = || {
                    std::fs::read_to_string(executable.with_extension("calls"))
                        .unwrap()
                        .lines()
                        .count()
                };
                let before = count();
                let output = execute_svn_with_configuration(
                    executable.clone(),
                    &args,
                    Some(root.to_str().unwrap()),
                    Some(config.clone()),
                )
                .await
                .unwrap();
                assert_eq!(
                    count(),
                    before + 1,
                    "local metadata must not probe the repository URL"
                );
                assert!(!output.contains("--config-option"));
            }
            for (args, cwd, options) in [
                (
                    vec!["checkout", "https://other.example/svn/repo", "wc"],
                    Some(root.to_str().unwrap()),
                    Some(config.clone()),
                ),
                (
                    vec![
                        "diff",
                        "--",
                        "https://legacy.example:8443/repo",
                        "https://other.example/repo",
                    ],
                    None,
                    Some(config.clone()),
                ),
                (
                    vec![
                        "commit",
                        "-m",
                        "https://legacy.example:8443/repo",
                        "--",
                        "file.txt",
                    ],
                    None,
                    Some(config.clone()),
                ),
                (vec!["log"], Some(root.to_str().unwrap()), None),
                (
                    vec!["status", "--xml", "--", "."],
                    Some(root.to_str().unwrap()),
                    Some(config.clone()),
                ),
                (
                    vec!["status", "--", "-u"],
                    Some(root.to_str().unwrap()),
                    Some(config.clone()),
                ),
            ] {
                let output =
                    execute_svn_with_configuration(executable.clone(), &args, cwd, options)
                        .await
                        .unwrap();
                assert_eq!(output.lines().next().unwrap(), normal_env);
                assert!(!output.contains("--trust-server-cert-failures"));
            }
            let config = SslCompatibility::new("legacy.example:8443", false, &root).unwrap();
            let output = execute_svn_with_configuration(
                executable.clone(),
                &["log"],
                Some(root.to_str().unwrap()),
                Some(config),
            )
            .await
            .unwrap();
            assert!(output.contains("legacy-tls.cnf"));
            assert!(!output.contains("--trust-server-cert-failures"));
        });
        assert_eq!(std::env::var_os("OPENSSL_CONF"), parent_env);
        assert!(std::fs::read_to_string(root.join("legacy-tls.cnf"))
            .unwrap()
            .contains("MinProtocol = TLSv1"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn non_ascii_paths_work_without_a_utf8_parent_locale() {
        const CHILD_MARKER: &str = "ORCASVN_ENCODING_TEST_CHILD";
        if std::env::var_os(CHILD_MARKER).is_none() {
            for executable in ["svn", "svnadmin"] {
                if std::process::Command::new(executable)
                    .arg("--version")
                    .output()
                    .is_err()
                {
                    eprintln!("Skipping encoding regression test: {executable} is unavailable");
                    return;
                }
            }
            // Isolate parent locale changes from other tests running in parallel.
            for locale in [None, Some("C"), Some("invalid_ORCASVN_locale")] {
                let mut child = std::process::Command::new(std::env::current_exe().unwrap());
                child.args([
                    "--exact",
                    "svn::executor::tests::non_ascii_paths_work_without_a_utf8_parent_locale",
                    "--nocapture",
                ]);
                child.env(CHILD_MARKER, "1");
                for variable in ["LC_ALL", "LC_CTYPE", "LANG"] {
                    match locale {
                        Some(value) => {
                            child.env(variable, value);
                        }
                        None => {
                            child.env_remove(variable);
                        }
                    }
                }
                let output = child.output().unwrap();
                assert!(
                    output.status.success(),
                    "encoding regression failed with parent locale {locale:?}:\n{}\n{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
            }
            return;
        }

        let directory = std::env::temp_dir().join(format!(
            "orcasvn-encoding-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(directory.clone());
        let repository = directory.join("repository");
        let created = std::process::Command::new("svnadmin")
            .arg("create")
            .arg(&repository)
            .output()
            .unwrap();
        assert!(created.status.success());
        let url = format!("file://{}", repository.to_str().unwrap());
        let wc = directory.join("工作副本");
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let run = |args: &[&str], path: Option<&str>| {
            runtime
                .block_on(execute_svn_inner(PathBuf::from("svn"), args, path))
                .unwrap()
        };
        run(&["checkout", &url, wc.to_str().unwrap()], None);
        std::fs::create_dir(wc.join("子目录")).unwrap();
        std::fs::write(wc.join("子目录/文件.xlsx"), "中文内容").unwrap();
        run(&["add", "子目录"], Some(wc.to_str().unwrap()));
        run(
            &["commit", "-m", "提交中文文件", "子目录/文件.xlsx", "子目录"],
            Some(wc.to_str().unwrap()),
        );
        let log = run(&["log", "--xml", "-v", &url], None);
        assert!(log.contains("提交中文文件"));
        assert!(log.contains("/子目录/文件.xlsx"));
        let second_wc = directory.join("第二副本");
        run(
            &[
                "checkout",
                &format!("{url}/子目录"),
                second_wc.to_str().unwrap(),
            ],
            None,
        );
        assert_eq!(
            std::fs::read_to_string(second_wc.join("文件.xlsx")).unwrap(),
            "中文内容"
        );
    }

    #[test]
    fn captures_svn_stdout() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build tokio runtime");

        let result = runtime.block_on(execute_svn(&["--version", "--quiet"], None));

        match result {
            Ok(output) => assert!(!output.trim().is_empty()),
            Err(SvnError::SvnNotFound) => {}
            Err(err) => panic!("unexpected svn executor error: {err}"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn failed_xml_commands_report_diagnostics_without_partial_xml() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let mut command = Command::new("sh");
        command.args(["-c", "printf '%s' '<?xml version=\"1.0\"?><status><target>'; echo 'svn: E120171: SSL communication failed' >&2; exit 1"]);
        let error = runtime
            .block_on(collect_command_output(
                &mut command,
                Duration::from_secs(10),
            ))
            .unwrap_err();
        assert_eq!(
            error.to_string(),
            "SVN 命令执行失败：svn: E120171: SSL communication failed"
        );
    }

    #[cfg(unix)]
    #[test]
    fn drains_large_stdout_and_stderr_without_blocking() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let mut command = Command::new("sh");
        command.args([
            "-c",
            "i=0; while [ $i -lt 10000 ]; do echo output; echo error >&2; i=$((i+1)); done",
        ]);
        command.kill_on_drop(true);
        let output = runtime
            .block_on(collect_command_output(
                &mut command,
                Duration::from_secs(10),
            ))
            .unwrap();
        assert_eq!(output.lines().count(), 10000);
    }

    #[cfg(unix)]
    #[test]
    fn timeout_kills_the_child() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let mut command = Command::new("sh");
        command.args(["-c", "echo $$; exec sleep 10"]);
        command.kill_on_drop(true);
        // Spawn explicitly so the test can check that the timed-out PID exits.
        command.stdout(Stdio::piped());
        runtime.block_on(async {
            let child = command.spawn().unwrap();
            let pid = child.id().unwrap();
            assert!(timeout(Duration::from_millis(30), child.wait_with_output())
                .await
                .is_err());
            for _ in 0..100 {
                let alive = std::process::Command::new("kill")
                    .args(["-0", &pid.to_string()])
                    .output()
                    .unwrap()
                    .status
                    .success();
                if !alive {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            panic!("timed-out child is still alive");
        });
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn finder_path_discovers_svn_and_opens_a_real_working_copy() {
        const MARKER: &str = "STONESVN_FINDER_PATH_TEST_CHILD";
        if std::env::var_os(MARKER).is_none() {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "svn::executor::tests::finder_path_discovers_svn_and_opens_a_real_working_copy",
                    "--nocapture",
                ])
                .env(MARKER, "1")
                .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            return;
        }
        let root =
            std::env::temp_dir().join(format!("stonesvn-finder-path-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                assert!(!configure_svn_executable(None).await.unwrap().is_empty());
                let executable = current_svn_executable().unwrap();
                let repository = root.join("repo");
                let working_copy = root.join("wc");
                let admin = if executable.is_absolute() {
                    executable.with_file_name("svnadmin")
                } else {
                    PathBuf::from("svnadmin")
                };
                assert!(std::process::Command::new(admin)
                    .arg("create")
                    .arg(&repository)
                    .status()
                    .unwrap()
                    .success());
                let url = format!("file://{}", repository.display());
                execute_svn(
                    &["checkout", "--", &url, working_copy.to_str().unwrap()],
                    None,
                )
                .await
                .unwrap();
                let status = execute_svn(&["status", "--xml"], working_copy.to_str())
                    .await
                    .unwrap();
                assert!(status.contains("<status>"));
                let info = execute_svn(&["info", "--xml"], working_copy.to_str())
                    .await
                    .unwrap();
                assert!(info.contains("<info>"));
                assert!(
                    configure_svn_executable(Some("/nonexistent/stonesvn-explicit-svn"))
                        .await
                        .is_err()
                );
                assert_eq!(current_svn_executable().unwrap(), executable);
            });
    }

    #[test]
    fn empty_executable_uses_default_command() {
        assert_eq!(normalize_svn_executable(Some("   ")), Path::new("svn"));
        assert_eq!(normalize_svn_executable(None), Path::new("svn"));
    }

    #[test]
    fn discovery_covers_supported_platforms_without_overriding_explicit_paths() {
        let env_value = |name: &str| match name {
            "ProgramFiles" | "ProgramW6432" => Some("C:/Program Files".into()),
            "ProgramFiles(x86)" => Some("C:/Program Files (x86)".into()),
            "ChocolateyInstall" => Some("C:/ProgramData/chocolatey".into()),
            "USERPROFILE" => Some("C:/Users/demo".into()),
            "LOCALAPPDATA" => Some("C:/Users/demo/AppData/Local".into()),
            "HOME" => Some("/home/demo".into()),
            _ => None,
        };
        for platform in ["windows", "macos", "linux"] {
            assert_eq!(
                svn_executable_candidates(Some(" /custom/svn "), platform, env_value),
                vec![PathBuf::from("/custom/svn")]
            );
            assert_eq!(
                svn_executable_candidates(Some(" "), platform, env_value),
                svn_executable_candidates(None, platform, env_value)
            );
        }
        let windows = svn_executable_candidates(None, "windows", env_value);
        assert_eq!(windows[0], PathBuf::from("svn"));
        for root in ["C:/Program Files", "C:/Program Files (x86)"] {
            for tool in ["SlikSvn", "TortoiseSVN", "VisualSVN"] {
                assert!(windows.contains(&PathBuf::from(root).join(tool).join("bin/svn.exe")));
            }
        }
        assert!(windows.contains(&PathBuf::from("C:/ProgramData/chocolatey").join("bin/svn.exe")));
        assert!(windows.contains(&PathBuf::from("C:/Users/demo").join("scoop/shims/svn.exe")));
        let mut unique = windows.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(windows.len(), unique.len());
        assert!(svn_executable_candidates(None, "macos", env_value)
            .contains(&PathBuf::from("/opt/homebrew/bin/svn")));
        assert!(svn_executable_candidates(None, "macos", env_value)
            .contains(&PathBuf::from("/opt/local/bin/svn")));
        let linux = svn_executable_candidates(None, "linux", env_value);
        assert!(linux.contains(&PathBuf::from("/usr/bin/svn")));
        assert!(linux.contains(&PathBuf::from("/home/demo").join(".local/bin/svn")));
        assert!(!svn_executable_candidates(None, "windows", |_| None)
            .contains(&PathBuf::from("bin/svn.exe")));
    }

    #[test]
    fn discovery_requires_an_svn_version_response() {
        for version in ["1.14.5\n", " 1.14.2 ", "1.15.0-dev"] {
            assert!(valid_svn_version(version));
        }
        for version in ["", "hello", "1.14", "svn 1.14.5", "1..5", "1.14.5\nwarning"] {
            assert!(!valid_svn_version(version));
        }
    }

    #[test]
    fn configured_executable_is_trimmed() {
        assert_eq!(
            normalize_svn_executable(Some("  C:\\Tools\\svn.exe  ")),
            Path::new("C:\\Tools\\svn.exe")
        );
    }

    #[test]
    fn global_options_precede_target_separator() {
        let args = vec![
            "diff".to_string(),
            "-c".to_string(),
            "12".to_string(),
            "--".to_string(),
            "https://example.test/repo/file@12".to_string(),
        ];

        assert_eq!(
            build_command_args(&args),
            [
                "--non-interactive",
                "diff",
                "-c",
                "12",
                "--",
                "https://example.test/repo/file@12"
            ]
        );
    }
}
