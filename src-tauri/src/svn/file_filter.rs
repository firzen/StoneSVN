use super::executor::SvnError;
use regex::Regex;
use std::fs;
use std::path::{Component, Path};

/// The same name/root-path glob semantics as parseFilterRules in the frontend.
/// This is an OrcaSVN filter, not a parser for .gitignore contents.
pub struct FileFilter {
    patterns: Vec<Regex>,
}

impl FileFilter {
    pub fn new(rules: &[String]) -> Self {
        let patterns = rules
            .iter()
            .filter_map(|rule| {
                let rule = rule.trim().replace('\\', "/");
                let anchored = rule.contains('/');
                let parts: Vec<_> = rule
                    .split('/')
                    .filter(|part| !part.is_empty() && *part != ".")
                    .collect();
                if parts.is_empty() || parts.contains(&"..") {
                    return None;
                }
                let chars: Vec<_> = parts.join("/").chars().collect();
                let mut source = String::from(if anchored { "(?s)^" } else { "(?s)(^|/)" });
                let mut i = 0;
                while i < chars.len() {
                    match chars[i] {
                        '*' if chars.get(i + 1) == Some(&'*') => {
                            while chars.get(i + 1) == Some(&'*') {
                                i += 1;
                            }
                            if chars.get(i + 1) == Some(&'/') {
                                source.push_str("(?:.*/)?");
                                i += 1;
                            } else {
                                source.push_str(".*");
                            }
                        }
                        '*' => source.push_str("[^/]*"),
                        '?' => source.push_str("[^/]"),
                        ch => source.push_str(&regex::escape(&ch.to_string())),
                    }
                    i += 1;
                }
                source.push_str("(?:/|$)");
                Some(Regex::new(&source).expect("escaped file filter pattern"))
            })
            .collect();
        Self { patterns }
    }

    pub fn is_empty(&self) -> bool {
        self.patterns.is_empty()
    }

    pub fn matches(&self, path: &str) -> bool {
        let path = path.replace('\\', "/");
        let path = path.trim_start_matches("./").trim_end_matches('/');
        self.patterns.iter().any(|pattern| pattern.is_match(path))
    }

    pub fn validate_targets(&self, files: &[String]) -> Result<(), SvnError> {
        if self.is_empty() {
            return Ok(());
        }
        for file in files {
            let normalized = file.replace('\\', "/");
            // Reject alternate spellings that could bypass a root-anchored rule.
            if Path::new(&normalized)
                .components()
                .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
                || normalized.as_bytes().get(1) == Some(&b':')
            {
                return Err(SvnError::InvalidArguments(format!(
                    "过滤已启用，请使用工作区内的相对路径：{file}"
                )));
            }
            let relative = normalized
                .split('/')
                .filter(|part| !part.is_empty() && *part != ".")
                .collect::<Vec<_>>()
                .join("/");
            if self.matches(&relative) {
                return Err(SvnError::InvalidArguments(format!(
                    "路径已被文件过滤规则排除：{file}"
                )));
            }
        }
        Ok(())
    }

    /// svn add recursively adds directory contents. Inspect the whole batch
    /// before mutation, and never follow symlinks into another directory.
    pub fn validate_add(&self, workspace: &str, files: &[String]) -> Result<(), SvnError> {
        self.validate_targets(files)?;
        if self.is_empty() {
            return Ok(());
        }
        let root = Path::new(workspace);
        let mut pending = files.to_vec();
        while let Some(relative) = pending.pop() {
            let absolute = root.join(&relative);
            let metadata = fs::symlink_metadata(&absolute)
                .map_err(|error| SvnError::CommandFailed(error.to_string()))?;
            if !metadata.is_dir() {
                continue;
            }
            for child in fs::read_dir(&absolute)
                .map_err(|error| SvnError::CommandFailed(error.to_string()))?
            {
                let child = child.map_err(|error| SvnError::CommandFailed(error.to_string()))?;
                if child.file_name() == ".svn" {
                    continue;
                }
                let child_path = child.path();
                let child_relative = child_path
                    .strip_prefix(root)
                    .map_err(|error| SvnError::InvalidArguments(error.to_string()))?
                    .to_string_lossy()
                    .replace('\\', "/");
                if self.matches(&child_relative) {
                    return Err(SvnError::InvalidArguments(format!(
                        "目录 {relative} 包含过滤项 {child_relative}，无法递归添加；请逐项添加或调整过滤规则"
                    )));
                }
                pending.push(child_relative);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_frontend_backend_matching_cases() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/file-filter.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let rules: Vec<String> = case["rules"]
                .as_array()
                .unwrap()
                .iter()
                .map(|rule| rule.as_str().unwrap().to_string())
                .collect();
            let filter = FileFilter::new(&rules);
            for (field, expected) in [("hidden", true), ("visible", false)] {
                for path in case[field].as_array().unwrap() {
                    assert_eq!(
                        filter.matches(path.as_str().unwrap()),
                        expected,
                        "rules={rules:?}, path={path}"
                    );
                }
            }
        }
    }

    #[test]
    fn alternate_paths_cannot_bypass_root_rules() {
        let filter = FileFilter::new(&["/_tmp1010".into()]);
        for path in [
            "./_tmp1010/a",
            "foo/../_tmp1010/a",
            "/_tmp1010/a",
            "C:/_tmp1010/a",
            ".//_tmp1010/a",
        ] {
            assert!(filter.validate_targets(&[path.into()]).is_err(), "{path}");
        }
        assert!(filter
            .validate_targets(&["other/_tmp1010/a".into()])
            .is_ok());
    }
}
