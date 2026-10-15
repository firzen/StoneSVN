use super::executor::SvnError;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use tauri::Url;
use tokio::process::Command;

const OPENSSL_CONFIG: &str = "openssl_conf = openssl_init\n\
[openssl_init]\nssl_conf = ssl_config\n\
[ssl_config]\nsystem_default = compatibility\n\
[compatibility]\nMinProtocol = TLSv1\nCipherString = DEFAULT:@SECLEVEL=0\n";
static CONFIGURATION: OnceLock<RwLock<BTreeMap<String, SslCompatibility>>> = OnceLock::new();

#[derive(Clone)]
pub(super) struct SslCompatibility {
    origin: String,
    config_path: PathBuf,
    legacy_tls: bool,
    trust_invalid_certificates: bool,
}

fn configuration() -> &'static RwLock<BTreeMap<String, SslCompatibility>> {
    CONFIGURATION.get_or_init(|| RwLock::new(BTreeMap::new()))
}

pub fn configure_server_security(
    server: &str,
    legacy_tls: bool,
    trust_invalid_certificates: bool,
    directory: &Path,
) -> Result<String, SvnError> {
    let origin = normalize_server(server)?;
    let next = (legacy_tls || trust_invalid_certificates)
        .then(|| {
            SslCompatibility::new_security(
                &origin,
                legacy_tls,
                trust_invalid_certificates,
                directory,
            )
        })
        .transpose()?;
    let mut configurations = configuration()
        .write()
        .map_err(|_| SvnError::CommandFailed("SSL 配置锁已损坏".into()))?;
    if let Some(next) = next {
        configurations.insert(origin.clone(), next);
    } else {
        configurations.remove(&origin);
    }
    Ok(origin)
}

pub(super) fn current_configurations() -> Result<Vec<SslCompatibility>, SvnError> {
    configuration()
        .read()
        .map(|config| config.values().cloned().collect())
        .map_err(|_| SvnError::CommandFailed("SSL 配置锁已损坏".into()))
}

impl SslCompatibility {
    #[cfg(test)]
    pub(super) fn new(
        server: &str,
        trust_invalid_certificates: bool,
        directory: &Path,
    ) -> Result<Self, SvnError> {
        Self::new_security(server, true, trust_invalid_certificates, directory)
    }

    fn new_security(
        server: &str,
        legacy_tls: bool,
        trust_invalid_certificates: bool,
        directory: &Path,
    ) -> Result<Self, SvnError> {
        let origin = normalize_server(server)?;
        std::fs::create_dir_all(directory).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
        let config_path = directory.join("legacy-tls.cnf");
        // Every setting combination uses the same file. Do not truncate a file
        // that an in-flight SVN process might currently be reading.
        if std::fs::read(&config_path).ok().as_deref() != Some(OPENSSL_CONFIG.as_bytes()) {
            std::fs::write(&config_path, OPENSSL_CONFIG)
                .map_err(|e| SvnError::CommandFailed(e.to_string()))?;
        }
        Ok(Self {
            origin,
            config_path,
            legacy_tls,
            trust_invalid_certificates,
        })
    }

    pub(super) fn matches(&self, url: &str) -> bool {
        Url::parse(url).is_ok_and(|url| {
            url.scheme() == "https" && url.origin().ascii_serialization() == self.origin
        })
    }

    pub(super) fn apply(&self, command: &mut Command) {
        // Child-process only: never mutate the app or system environment.
        if self.legacy_tls {
            command.env("OPENSSL_CONF", &self.config_path);
        }
        if self.trust_invalid_certificates {
            command.arg("--trust-server-cert-failures=unknown-ca,cn-mismatch,expired");
        }
    }
}

fn normalize_server(server: &str) -> Result<String, SvnError> {
    let server = server.trim();
    let value = if server.contains("://") {
        server.to_string()
    } else {
        format!("https://{server}")
    };
    let url = Url::parse(&value).map_err(|_| {
        SvnError::InvalidArguments("请输入 HTTPS 服务器地址，例如 svn.example.com:8443".into())
    })?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(SvnError::InvalidArguments(
            "兼容服务器必须是 HTTPS 地址，且不能包含账号或密码".into(),
        ));
    }
    Ok(url.origin().ascii_serialization())
}

// Examine actual targets, never option values such as commit messages.
pub(super) fn explicit_urls<'a>(args: &'a [&'a str]) -> Vec<&'a str> {
    let targets = if let Some(separator) = args.iter().position(|arg| *arg == "--") {
        &args[separator + 1..]
    } else if matches!(args.first(), Some(&"checkout" | &"switch" | &"merge")) {
        &args[1..]
    } else {
        &[]
    };
    targets
        .iter()
        .copied()
        .filter(|arg| arg.contains("://"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_only_the_configured_https_origin() {
        let config = SslCompatibility {
            origin: normalize_server("SVN.example.com:8443/svn/repo").unwrap(),
            config_path: PathBuf::new(),
            legacy_tls: true,
            trust_invalid_certificates: false,
        };
        assert!(config.matches("https://user@svn.example.com:8443/svn/other"));
        for url in [
            "https://svn.example.com/repo",
            "http://svn.example.com:8443/repo",
            "https://svn.example.com.evil:8443/repo",
            "https://other.example.com:8443/repo",
        ] {
            assert!(!config.matches(url));
        }
        assert_eq!(
            normalize_server("svn.example.com:443").unwrap(),
            "https://svn.example.com"
        );
        assert_eq!(
            normalize_server("https://[::1]:8443/repo").unwrap(),
            "https://[::1]:8443"
        );
        for server in [
            "",
            "http://svn.example.com",
            "https://user:secret@svn.example.com",
            "bad host",
        ] {
            assert!(normalize_server(server).is_err());
        }
    }

    #[test]
    fn command_messages_cannot_enable_compatibility() {
        assert!(explicit_urls(&[
            "commit",
            "-m",
            "https://svn.example.com/repo",
            "--",
            "file.txt"
        ])
        .is_empty());
        assert_eq!(
            explicit_urls(&["checkout", "-r", "1", "https://svn.example.com/repo", "wc"]),
            ["https://svn.example.com/repo"]
        );
        assert_eq!(
            explicit_urls(&["diff", "-c", "1", "--", "https://svn.example.com/repo@1"]),
            ["https://svn.example.com/repo@1"]
        );
    }

    #[test]
    fn trusting_a_certificate_does_not_enable_legacy_tls() {
        let directory =
            std::env::temp_dir().join(format!("orcasvn-cert-only-{}", std::process::id()));
        let config =
            SslCompatibility::new_security("https://modern.example", false, true, &directory)
                .unwrap();
        let mut command = Command::new("svn");
        config.apply(&mut command);
        assert!(!command
            .as_std()
            .get_envs()
            .any(|(key, _)| key == "OPENSSL_CONF"));
        assert!(command
            .as_std()
            .get_args()
            .any(|arg| arg == "--trust-server-cert-failures=unknown-ca,cn-mismatch,expired"));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
