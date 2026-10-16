use super::executor::SvnError;
use super::operations::{diff, normalize_workspace_diff_file, resolve_workspace_file_path};
use crate::DiffResult;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct FilePreviewResult {
    #[serde(flatten)]
    pub result: DiffResult,
    pub preview_kind: &'static str,
    pub image_data: Option<String>,
    pub can_open: bool,
}

fn image_mime(file: &str) -> Option<&'static str> {
    match Path::new(file)
        .extension()?
        .to_str()?
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Some("image/png"),
        "jpg" | "jpeg" | "jfif" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "svg" => Some("image/svg+xml"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

fn binary_extension(file: &str) -> bool {
    let extension = Path::new(file)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "doc"
            | "docx"
            | "xls"
            | "xlsx"
            | "ppt"
            | "pptx"
            | "odt"
            | "ods"
            | "odp"
            | "pdf"
            | "rtf"
            | "zip"
            | "gz"
            | "7z"
            | "rar"
            | "tar"
            | "exe"
            | "dll"
            | "dylib"
            | "so"
            | "bin"
            | "mp3"
            | "mp4"
            | "wav"
            | "mov"
            | "avi"
            | "tif"
            | "tiff"
            | "heic"
            | "psd"
            | "woff"
            | "woff2"
            | "ttf"
            | "otf"
    )
}

fn is_text(bytes: &[u8]) -> bool {
    // The fixed-size sample may end in the middle of a UTF-8 character.
    (match std::str::from_utf8(bytes) {
        Ok(_) => true,
        Err(error) => bytes.len() == 8192 && error.error_len().is_none(),
    }) && !bytes
        .iter()
        .any(|byte| byte.is_ascii_control() && !matches!(byte, b'\n' | b'\r' | b'\t' | 12))
}

pub async fn file_preview(
    workspace: &str,
    file: &str,
    old_rev: Option<u64>,
    new_rev: Option<u64>,
) -> Result<FilePreviewResult, SvnError> {
    let file = normalize_workspace_diff_file(workspace, file)?;
    let historical = old_rev.is_some() || new_rev.is_some();
    let (old_revision, new_revision) = match (old_rev, new_rev) {
        (Some(old), Some(new)) => (old, new),
        (Some(change), None) => (change.saturating_sub(1), change),
        (None, Some(_)) => {
            return Err(SvnError::InvalidArguments(
                "新版本不能在没有旧版本的情况下单独指定".to_string(),
            ))
        }
        (None, None) => (0, 0),
    };
    let mut preview = FilePreviewResult {
        result: DiffResult {
            path: file.clone(),
            diff: String::new(),
            old_revision,
            new_revision,
        },
        preview_kind: "text",
        image_data: None,
        can_open: false,
    };
    if !historical {
        let local = Path::new(workspace).join(&file);
        // Missing/deleted paths still need an SVN diff; other I/O errors must surface.
        match fs::metadata(&local) {
            Ok(_) => {
                let target = resolve_workspace_file_path(workspace, &file)?;
                preview.can_open = true;
                if target.is_dir() {
                    preview.preview_kind = "directory";
                    return Ok(preview);
                }
                if let Some(mime) = image_mime(&file) {
                    let bytes =
                        fs::read(&target).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
                    preview.preview_kind = "image";
                    preview.image_data =
                        Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
                    return Ok(preview);
                }
                if binary_extension(&file) {
                    preview.preview_kind = "binary";
                    return Ok(preview);
                }
                let mut bytes = [0; 8192];
                let mut input =
                    fs::File::open(&target).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
                let mut length = 0;
                while length < bytes.len() {
                    let read = input
                        .read(&mut bytes[length..])
                        .map_err(|e| SvnError::CommandFailed(e.to_string()))?;
                    if read == 0 {
                        break;
                    }
                    length += read;
                }
                if !is_text(&bytes[..length]) {
                    preview.preview_kind = "binary";
                    return Ok(preview);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(SvnError::CommandFailed(error.to_string())),
        }
    }
    if binary_extension(&file) || image_mime(&file).is_some() {
        preview.preview_kind = "binary";
        return Ok(preview);
    }
    preview.result = diff(workspace, &file, old_rev, new_rev).await?;
    if preview
        .result
        .diff
        .lines()
        .any(|line| line == "Cannot display: file marked as a binary type.")
    {
        preview.preview_kind = "binary";
        preview.result.diff.clear();
    }
    Ok(preview)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distinguishes_text_images_and_binary_content() {
        assert!(is_text("正文\nhello\tworld\r\n".as_bytes()));
        assert!(is_text(b""));
        assert!(!is_text(b"binary\0data"));
        assert!(!is_text(&[0xff, 0xfe]));
        let split_utf8 = format!("{}汉", "a".repeat(8191));
        assert!(is_text(&split_utf8.as_bytes()[..8192]));
        assert!(binary_extension("Report.DOCX"));
        assert_eq!(image_mime("photo.JPG"), Some("image/jpeg"));
        assert_eq!(image_mime("code.ts"), None);
    }

    #[test]
    fn previews_directories_images_and_documents_without_svn_or_lossy_text() {
        let root = std::env::temp_dir().join(format!(
            "orcasvn-preview-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("directory")).unwrap();
        fs::write(root.join("image.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        fs::write(root.join("report.docx"), b"PK\0binary").unwrap();
        fs::write(root.join("unknown"), b"\0binary").unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let workspace = root.to_str().unwrap();
            for (file, kind) in [
                ("directory", "directory"),
                ("image.png", "image"),
                ("report.docx", "binary"),
                ("unknown", "binary"),
            ] {
                let result = file_preview(workspace, file, None, None).await.unwrap();
                assert_eq!(result.preview_kind, kind);
                assert!(result.result.diff.is_empty());
                assert!(result.can_open);
                if kind == "image" {
                    assert_eq!(
                        result.image_data.unwrap(),
                        "data:image/png;base64,iVBORw0KGgo="
                    );
                }
            }
            let historical = file_preview(workspace, "image.png", Some(1), Some(2))
                .await
                .unwrap();
            assert_eq!(historical.preview_kind, "binary");
            assert!(historical.image_data.is_none());
            assert!(!historical.can_open);
        });
        fs::remove_dir_all(root).unwrap();
    }
}
