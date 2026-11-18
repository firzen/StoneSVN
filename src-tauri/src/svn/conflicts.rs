//! Conflict inspection uses local SVN metadata and artifacts, never an ordinary diff.
use super::executor::{execute_svn, SvnError};
use super::properties::{checked_target_path, parse_properties, set_property};
use super::working_copy::local_target;
use quick_xml::{events::Event, Reader};
use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
};

const LIMIT: u64 = 2 * 1024 * 1024;
#[derive(Debug, Default, Serialize)]
pub struct ConflictDetails {
    pub text: bool,
    pub property: bool,
    pub tree: bool,
    pub operation: String,
    pub reason: String,
    pub action: String,
    pub directory: bool,
    pub base: Option<String>,
    pub local: Option<String>,
    pub incoming: Option<String>,
    pub working: Option<String>,
    pub properties: Vec<ConflictProperty>,
    pub rejection: Option<String>,
    pub unavailable: Vec<String>,
    pub token: String,
}
#[derive(Debug, Serialize)]
pub struct ConflictProperty {
    pub name: String,
    pub local: Option<String>,
    pub base: Option<String>,
    pub incoming: Option<String>,
    pub incoming_known: bool,
}
#[derive(Debug, Deserialize)]
pub struct PropertyResolution {
    pub name: String,
    pub value: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct ConflictResolution {
    pub token: String,
    pub text: Option<String>,
    pub properties: Vec<PropertyResolution>,
    pub manual_text: bool,
    pub manual_properties: bool,
    pub tree: String,
}
#[derive(Default)]
struct Metadata {
    details: ConflictDetails,
    base_file: String,
    local_file: String,
    incoming_file: String,
    prop_file: String,
}
fn canonical_xml(xml: &str) -> Result<String, SvnError> {
    let mut reader = Reader::from_str(xml);
    let mut result = String::new();
    loop {
        match reader
            .read_event()
            .map_err(|e| SvnError::ParseError(e.to_string()))?
        {
            Event::Start(e) | Event::Empty(e) => {
                result.push_str(&format!("<{:?}", e.name()));
                let mut attrs = e
                    .attributes()
                    .map(|a| {
                        let a = a.map_err(|e| SvnError::ParseError(e.to_string()))?;
                        Ok((
                            String::from_utf8_lossy(a.key.as_ref()).into_owned(),
                            a.unescape_value()
                                .map_err(|e| SvnError::ParseError(e.to_string()))?
                                .into_owned(),
                        ))
                    })
                    .collect::<Result<Vec<_>, SvnError>>()?;
                attrs.sort();
                result.push_str(&serde_json::to_string(&attrs).unwrap());
                result.push('>');
            }
            Event::End(e) => result.push_str(&format!("</{:?}>", e.name())),
            Event::Text(e) => result.push_str(&format!(
                "{:?}",
                e.unescape()
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
            )),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(result)
}
fn metadata(xml: &str) -> Result<Metadata, SvnError> {
    let mut result = Metadata::default();
    let mut reader = Reader::from_str(xml);
    let mut field = String::new();
    loop {
        match reader
            .read_event()
            .map_err(|e| SvnError::ParseError(e.to_string()))?
        {
            Event::Start(e) | Event::Empty(e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                field = name.clone();
                match field.as_str() {
                    "prev-base-file" => result.base_file.clear(),
                    "prev-wc-file" => result.local_file.clear(),
                    "cur-base-file" => result.incoming_file.clear(),
                    "prop-file" => result.prop_file.clear(),
                    _ => {}
                }
                let mut attributes = std::collections::HashMap::new();
                for a in e.attributes() {
                    let a = a.map_err(|e| SvnError::ParseError(e.to_string()))?;
                    attributes.insert(
                        String::from_utf8_lossy(a.key.as_ref()).into_owned(),
                        a.unescape_value()
                            .map_err(|e| SvnError::ParseError(e.to_string()))?
                            .into_owned(),
                    );
                }
                if name == "entry" {
                    result.details.directory = attributes.get("kind").is_some_and(|k| k == "dir");
                }
                if name == "conflict" || name == "tree-conflict" {
                    let kind = attributes.get("type").map(String::as_str).unwrap_or("");
                    result.details.text |= kind == "text";
                    result.details.property |= kind == "property";
                    result.details.tree |= name == "tree-conflict" || kind == "tree";
                    for (key, target) in [
                        ("operation", &mut result.details.operation),
                        ("reason", &mut result.details.reason),
                        ("action", &mut result.details.action),
                    ] {
                        if let Some(value) = attributes.get(key) {
                            *target = value.clone();
                        }
                    }
                }
            }
            Event::Text(e) => {
                let value = e
                    .unescape()
                    .map_err(|e| SvnError::ParseError(e.to_string()))?
                    .into_owned();
                match field.as_str() {
                    "prev-base-file" => result.base_file.push_str(&value),
                    "prev-wc-file" => result.local_file.push_str(&value),
                    "cur-base-file" => result.incoming_file.push_str(&value),
                    "prop-file" => result.prop_file.push_str(&value),
                    _ => {}
                }
            }
            Event::End(_) => field.clear(),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(result)
}
fn read_text(workspace: &str, file: &str) -> Result<String, SvnError> {
    // SVN info returns absolute artifact paths; convert only verified in-workspace
    // regular files back to relative paths before using the shared path guard.
    let relative;
    let file = if std::path::Path::new(file).is_absolute() {
        if fs::symlink_metadata(file)
            .map_err(|e| SvnError::CommandFailed(e.to_string()))?
            .is_symlink()
        {
            return Err(SvnError::InvalidArguments(
                "Conflict artifacts must not be symbolic links".into(),
            ));
        }
        let root =
            fs::canonicalize(workspace).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
        let actual = fs::canonicalize(file).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
        relative = actual
            .strip_prefix(root)
            .map_err(|_| {
                SvnError::InvalidArguments("Conflict artifact outside working copy".into())
            })?
            .to_string_lossy()
            .into_owned();
        relative.as_str()
    } else {
        file
    };
    let target = checked_target_path(workspace, file, false)?;
    let meta = fs::symlink_metadata(&target).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    if !meta.is_file() || meta.is_symlink() || meta.len() > LIMIT {
        return Err(SvnError::InvalidArguments(
            "Text preview requires a regular UTF-8 file up to 2 MiB".into(),
        ));
    }
    let bytes = fs::read(target).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    if bytes.contains(&0) {
        return Err(SvnError::InvalidArguments("Binary conflict content".into()));
    }
    String::from_utf8(bytes).map_err(|e| SvnError::ParseError(e.to_string()))
}
fn read_artifact(workspace: &str, file: &str, errors: &mut Vec<String>) -> Option<String> {
    if file.is_empty() {
        return None;
    }
    match read_text(workspace, file) {
        Ok(text) => Some(text),
        Err(e) => {
            errors.push(e.to_string());
            None
        }
    }
}
// Reject files may concatenate markers directly to values without a newline.
// Only offer incoming values when the English reject format is unambiguous;
// other SVN versions/locales keep the original rejection available for manual review.
fn reject_properties(
    text: &str,
    local: &[super::properties::SvnProperty],
) -> Vec<ConflictProperty> {
    let names = regex::Regex::new(r"(?m)^(?:Trying to (?:add new|change|delete) property|Conflict for property) '([^'\r\n]+)'[^\r\n]*").unwrap();
    let headers = names.captures_iter(text).collect::<Vec<_>>();
    let mut properties = Vec::new();
    for (index, header) in headers.iter().enumerate() {
        let name = header[1].to_string();
        if properties.iter().any(|p: &ConflictProperty| p.name == name) {
            return Vec::new();
        }
        let start = header.get(0).unwrap();
        let block = &text[start.end()
            ..headers
                .get(index + 1)
                .map(|h| h.get(0).unwrap().start())
                .unwrap_or(text.len())];
        let local_property = local.iter().find(|p| p.name == name);
        if local_property.is_some_and(|p| p.binary) {
            return Vec::new();
        }
        let mut base = None;
        let mut incoming = None;
        let mut incoming_known = false;
        if let (Some(left), Some(split), Some(right)) = (
            block.find("||||||| (incoming 'changed from' value)"),
            block
                .find("=======\n")
                .or_else(|| block.find("=======\r\n")),
            block.find(">>>>>>> (incoming 'changed to' value)"),
        ) {
            let from = left + "||||||| (incoming 'changed from' value)".len();
            let to = split
                + if block[split..].starts_with("=======\r\n") {
                    9
                } else {
                    8
                };
            if from < split && to <= right {
                let original = block[from..split]
                    .strip_prefix("\r\n")
                    .or_else(|| block[from..split].strip_prefix('\n'))
                    .unwrap_or(&block[from..split]);
                if !original.is_empty() {
                    base = Some(original.to_string());
                }
                incoming = Some(block[to..right].to_string());
                // An empty incoming value can mean deletion or an empty string.
                // Never guess which operation SVN intended.
                incoming_known = incoming.as_ref().is_some_and(|v| !v.is_empty())
                    && !incoming.as_ref().unwrap().contains("<<<<<<<");
            }
        }
        properties.push(ConflictProperty {
            name,
            local: local_property.map(|p| p.value.clone()),
            base,
            incoming,
            incoming_known,
        });
    }
    properties
}
fn has_markers(text: &str) -> bool {
    text.lines().any(|line| {
        line.starts_with("<<<<<<< ")
            || line.starts_with("||||||| ")
            || line.starts_with(">>>>>>> ")
            || line == "======="
    })
}
pub async fn conflict_details(workspace: &str, file: &str) -> Result<ConflictDetails, SvnError> {
    let target = local_target(workspace, file)?;
    let xml = execute_svn(&["info", "--xml", "--", &target], Some(workspace)).await?;
    let meta = metadata(&xml)?;
    let mut d = meta.details;
    if d.text || d.tree && !d.directory {
        d.working = read_artifact(workspace, file, &mut d.unavailable);
    }
    if d.text {
        d.base = read_artifact(workspace, &meta.base_file, &mut d.unavailable);
        d.local = read_artifact(workspace, &meta.local_file, &mut d.unavailable);
        d.incoming = read_artifact(workspace, &meta.incoming_file, &mut d.unavailable);
    }
    if d.property {
        d.rejection = read_artifact(workspace, &meta.prop_file, &mut d.unavailable);
        let xml = execute_svn(
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
        .await?;
        let local = parse_properties(&xml)?;
        if let Some(rejection) = &d.rejection {
            d.properties = reject_properties(rejection, &local);
        }
        if d.properties.is_empty() || d.properties.iter().any(|p| !p.incoming_known) {
            d.unavailable
                .push("Property conflict values require manual review".into());
        }
        // Include ALL current properties in the review token, including binary values.
        d.token = canonical_xml(&xml)?;
    }
    let mut hash = DefaultHasher::new();
    canonical_xml(&xml)?.hash(&mut hash);
    serde_json::to_string(&d)
        .map_err(|e| SvnError::ParseError(e.to_string()))?
        .hash(&mut hash);
    // Include raw current file bytes even when a preview cannot decode them.
    let local = checked_target_path(workspace, file, true)?;
    if local.is_file() && !local.is_symlink() {
        use std::io::Read;
        let mut input =
            fs::File::open(&local).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
        let mut bytes = [0; 8192];
        loop {
            let length = input
                .read(&mut bytes)
                .map_err(|e| SvnError::CommandFailed(e.to_string()))?;
            if length == 0 {
                break;
            }
            hash.write(&bytes[..length]);
        }
    }
    d.token = format!("{:016x}", hash.finish());
    Ok(d)
}
pub async fn apply_conflict(
    workspace: &str,
    file: &str,
    resolution: ConflictResolution,
) -> Result<String, SvnError> {
    let d = conflict_details(workspace, file).await?;
    if d.token != resolution.token || !(d.text || d.property || d.tree) {
        return Err(SvnError::InvalidArguments(
            "Conflict changed. Reload and review before applying.".into(),
        ));
    }
    let local = checked_target_path(workspace, file, false)?;
    if local.is_symlink() {
        return Err(SvnError::InvalidArguments(
            "Resolve symbolic links manually".into(),
        ));
    }
    if d.text && resolution.text.is_none() && !resolution.manual_text {
        return Err(SvnError::InvalidArguments(
            "Review the merged text first".into(),
        ));
    }
    if let Some(text) = &resolution.text {
        if !d.text
            || d.working.is_none()
            || text.len() as u64 > LIMIT
            || has_markers(text)
            || text.contains('\0')
        {
            return Err(SvnError::InvalidArguments(
                "Merged result must be readable text without conflict markers".into(),
            ));
        }
    } else if d.text && d.working.as_ref().is_some_and(|text| has_markers(text)) {
        return Err(SvnError::InvalidArguments(
            "Remove conflict markers first".into(),
        ));
    }
    if d.property && !resolution.manual_properties {
        let names = resolution
            .properties
            .iter()
            .map(|p| p.name.as_str())
            .collect::<std::collections::HashSet<_>>();
        if d.properties.is_empty()
            || names.len() != resolution.properties.len()
            || names.len() != d.properties.len()
            || d.properties
                .iter()
                .any(|p| !p.incoming_known || !names.contains(p.name.as_str()))
        {
            return Err(SvnError::InvalidArguments(
                "Review every conflicting property first".into(),
            ));
        }
    } else if !resolution.properties.is_empty() {
        return Err(SvnError::InvalidArguments(
            "Unexpected property changes".into(),
        ));
    }
    let delete = d.tree && resolution.tree == "delete";
    if d.tree
        && !(resolution.tree == "manual"
            || resolution.tree == "working"
                && d.action == "delete"
                && d.reason == "edit"
                && !d.directory
                && !d.text
                && !d.property
            || delete
                && d.action == "delete"
                && d.reason == "edit"
                && !d.directory
                && local.is_file()
                && !d.text
                && !d.property)
    {
        return Err(SvnError::InvalidArguments(
            "Review this tree conflict manually before marking resolved".into(),
        ));
    }
    // Validate every property before starting any mutations.
    if resolution.properties.iter().any(|p| {
        p.name.is_empty()
            || p.name.trim() != p.name
            || p.name.chars().any(|c| c.is_whitespace() || c.is_control())
            || p.value
                .as_ref()
                .is_some_and(|v| v.len() as u64 > LIMIT || v.contains('\0'))
    }) {
        return Err(SvnError::InvalidArguments(
            "Invalid property resolution".into(),
        ));
    }
    if let Some(text) = resolution.text {
        fs::write(local, text.as_bytes()).map_err(|e| SvnError::CommandFailed(e.to_string()))?;
    }
    for property in resolution.properties {
        set_property(workspace, file, &property.name, property.value.as_deref()).await?;
    }
    if delete {
        let target = local_target(workspace, file)?;
        execute_svn(&["delete", "--force", "--", &target], Some(workspace)).await?;
        // Deleting an added conflict victim can remove its conflict metadata too.
        let xml = execute_svn(
            &["status", "--xml", "--depth", "empty", "--", &target],
            Some(workspace),
        )
        .await?;
        if !super::parser::parse_status_xml(&xml)?
            .iter()
            .any(|e| e.status_code == "conflicted" || e.prop_status == "conflicted")
        {
            return Ok(String::new());
        }
    }
    super::operations::resolve(workspace, &[file.into()], "working").await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{path::PathBuf, process::Command};

    #[test]
    fn metadata_preserves_all_conflict_types_and_xml_entities() {
        let m = metadata("<info><entry kind=\"file\"><conflict type=\"text\" operation=\"update\"><prev-wc-file>a&amp;b.mine</prev-wc-file></conflict><conflict type=\"property\"><prop-file>a.prej</prop-file></conflict><tree-conflict reason=\"edit\" action=\"delete\" operation=\"merge\"/></entry></info>").unwrap();
        assert!(m.details.text && m.details.property && m.details.tree);
        assert_eq!(m.local_file, "a&b.mine");
        assert_eq!(m.details.reason, "edit");
        assert_eq!(m.details.action, "delete");
    }
    #[test]
    fn property_rejects_preserve_values_and_do_not_guess_empty_incoming_deletion() {
        let local = vec![super::super::properties::SvnProperty {
            name: "demo:label".into(),
            value: "local".into(),
            binary: false,
        }];
        let reject = "Trying to add new property 'demo:label'\nbut the property already exists.\n<<<<<<< (local property value)\nlocal||||||| (incoming 'changed from' value)\n=======\nincoming\r\nmultiline>>>>>>> (incoming 'changed to' value)\n";
        let p = reject_properties(reject, &local);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].incoming.as_deref(), Some("incoming\r\nmultiline"));
        assert!(p[0].incoming_known);
        assert!(
            !reject_properties(&reject.replace("incoming\r\nmultiline", ""), &local)[0]
                .incoming_known
        );
        assert!(reject_properties("Unrecognized reject format", &local).is_empty());
    }
    struct Fixture(PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn run(root: &PathBuf, program: &str, args: &[&str]) -> String {
        let out = Command::new(program)
            .args(args)
            .current_dir(root)
            .env("LC_ALL", "C")
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8(out.stdout).unwrap()
    }
    fn resolution(d: &ConflictDetails) -> ConflictResolution {
        ConflictResolution {
            token: d.token.clone(),
            text: None,
            properties: vec![],
            manual_text: false,
            manual_properties: false,
            tree: String::new(),
        }
    }
    #[test]
    fn real_conflicts_inspect_and_resolve_without_touching_unrelated_content() {
        for program in ["svn", "svnadmin"] {
            if Command::new(program).arg("--version").output().is_err() {
                return;
            }
        }
        let root = std::env::temp_dir().join(format!(
            "stonesvn-conflicts-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let root = PathBuf::from(super::super::operations::normalize_svn_path(
            &fs::canonicalize(root).unwrap().to_string_lossy(),
        ));
        let _fixture = Fixture(root.clone());
        run(&root, "svnadmin", &["create", "repo"]);
        let url = tauri::Url::from_file_path(root.join("repo"))
            .unwrap()
            .to_string();
        run(&root, "svn", &["checkout", &url, "author"]);
        for name in [
            "text.txt",
            "property.txt",
            "tree.txt",
            "both.txt",
            "delete.txt",
        ] {
            fs::write(root.join("author").join(name), "base\n").unwrap();
        }
        run(
            &root,
            "svn",
            &[
                "add",
                "author/text.txt",
                "author/property.txt",
                "author/tree.txt",
                "author/both.txt",
                "author/delete.txt",
            ],
        );
        run(
            &root,
            "svn",
            &[
                "propset",
                "demo:label",
                "base",
                "author/property.txt",
                "author/both.txt",
            ],
        );
        run(
            &root,
            "svn",
            &[
                "propset",
                "demo:unrelated",
                "preserve",
                "author/property.txt",
            ],
        );
        run(&root, "svn", &["commit", "author", "-m", "base"]);
        run(&root, "svn", &["checkout", &url, "wc"]);
        for dir in ["author", "wc"] {
            let value = if dir == "author" { "incoming" } else { "local" };
            for name in ["text.txt", "both.txt"] {
                fs::write(root.join(dir).join(name), format!("{value}\n")).unwrap();
            }
            run(
                &root,
                "svn",
                &[
                    "propset",
                    "demo:label",
                    value,
                    &format!("{dir}/property.txt"),
                    &format!("{dir}/both.txt"),
                ],
            );
        }
        fs::write(root.join("wc/tree.txt"), "local tree edit\n").unwrap();
        fs::write(root.join("wc/delete.txt"), "local delete edit\n").unwrap();
        run(
            &root,
            "svn",
            &["delete", "author/tree.txt", "author/delete.txt"],
        );
        run(&root, "svn", &["commit", "author", "-m", "incoming"]);
        run(&root, "svn", &["update", "--accept", "postpone", "wc"]);
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let wc_path = root.join("wc");
                let wc = wc_path.to_str().unwrap();
                let d = conflict_details(wc, "property.txt").await.unwrap();
                assert!(d.property && !d.text);
                assert_eq!(d.properties.len(), 1, "details: {d:?}");
                assert_eq!(d.properties[0].incoming.as_deref(), Some("incoming"));
                let mut r = resolution(&d);
                r.properties.push(PropertyResolution {
                    name: "demo:label".into(),
                    value: Some("chosen 中文\n*\n".into()),
                });
                apply_conflict(wc, "property.txt", r).await.unwrap();
                assert_eq!(
                    fs::read_to_string(wc_path.join("property.txt")).unwrap(),
                    "base\n"
                );
                assert_eq!(
                    run(
                        &root,
                        "svn",
                        &["propget", "--strict", "demo:unrelated", "wc/property.txt"]
                    ),
                    "preserve"
                );
                assert_eq!(
                    run(
                        &root,
                        "svn",
                        &["propget", "--strict", "demo:label", "wc/property.txt"]
                    ),
                    "chosen 中文\n*\n"
                );
                assert!(!conflict_details(wc, "property.txt").await.unwrap().property);

                let d = conflict_details(wc, "text.txt").await.unwrap();
                assert!(d.text);
                assert!(d.working.as_ref().unwrap().contains("<<<<<<<"));
                let mut r = resolution(&d);
                r.text = Some("<<<<<<< unresolved\n".into());
                assert!(apply_conflict(wc, "text.txt", r).await.is_err());
                fs::write(wc_path.join("text.txt"), "external edit\n").unwrap();
                let mut stale = resolution(&d);
                stale.text = Some("overwritten".into());
                assert!(apply_conflict(wc, "text.txt", stale).await.is_err());
                assert_eq!(
                    fs::read_to_string(wc_path.join("text.txt")).unwrap(),
                    "external edit\n"
                );
                let d = conflict_details(wc, "text.txt").await.unwrap();
                let mut r = resolution(&d);
                r.text = Some("merged\n".into());
                apply_conflict(wc, "text.txt", r).await.unwrap();
                assert!(!conflict_details(wc, "text.txt").await.unwrap().text);

                let d = conflict_details(wc, "both.txt").await.unwrap();
                assert!(d.text && d.property);
                let mut r = resolution(&d);
                r.text = Some("merged both\n".into());
                assert!(apply_conflict(wc, "both.txt", r).await.is_err());
                assert!(fs::read_to_string(wc_path.join("both.txt"))
                    .unwrap()
                    .contains("<<<<<<<"));
                let mut r = resolution(&d);
                r.text = Some("merged both\n".into());
                if d.properties.len() == 1 && d.properties[0].incoming_known {
                    r.properties.push(PropertyResolution {
                        name: "demo:label".into(),
                        value: Some("incoming".into()),
                    });
                } else {
                    // SVN 1.14 can incorrectly report the text r2 artifact as
                    // prop-file on mixed conflicts. Require explicit manual review.
                    assert!(!d.unavailable.is_empty());
                    set_property(wc, "both.txt", "demo:label", Some("incoming"))
                        .await
                        .unwrap();
                    r.token = conflict_details(wc, "both.txt").await.unwrap().token;
                    r.manual_properties = true;
                }
                apply_conflict(wc, "both.txt", r).await.unwrap();
                let d = conflict_details(wc, "both.txt").await.unwrap();
                assert!(!d.text && !d.property);

                let d = conflict_details(wc, "tree.txt").await.unwrap();
                assert!(d.tree && d.reason == "edit" && d.action == "delete");
                let mut r = resolution(&d);
                r.tree = "working".into();
                apply_conflict(wc, "tree.txt", r).await.unwrap();
                assert_eq!(
                    fs::read_to_string(wc_path.join("tree.txt")).unwrap(),
                    "local tree edit\n"
                );
                assert!(!conflict_details(wc, "tree.txt").await.unwrap().tree);
                let d = conflict_details(wc, "delete.txt").await.unwrap();
                let mut r = resolution(&d);
                r.tree = "delete".into();
                apply_conflict(wc, "delete.txt", r).await.unwrap();
                assert!(!wc_path.join("delete.txt").exists());
                assert!(conflict_details(wc, "../author/text.txt").await.is_err());
            });
    }
}
