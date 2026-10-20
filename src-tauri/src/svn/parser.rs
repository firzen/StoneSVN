use crate::{SvnInfo, SvnLogEntry, SvnLogPath, SvnStatus};
use quick_xml::events::Event;
use quick_xml::Reader;

use super::executor::SvnError;

pub fn parse_status_xml(xml: &str) -> Result<Vec<SvnStatus>, SvnError> {
    let mut statuses = Vec::new();
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut in_entry = false;
    let mut current_path = String::new();
    let mut status_code = String::new();
    let mut prop_status = String::new();
    let mut locked = false;
    let mut switched = false;
    let mut history = false;
    let mut tree_conflicted = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => match e.name().as_ref() {
                b"entry" => {
                    in_entry = true;
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"path" {
                            current_path = attr
                                .unescape_value()
                                .map_err(|e| SvnError::ParseError(e.to_string()))?
                                .into_owned();
                            // Filesystem inventories use forward slashes. SVN on
                            // Windows emits backslashes even for scoped targets.
                            #[cfg(windows)]
                            {
                                current_path = current_path.replace('\\', "/");
                            }
                        }
                    }
                }
                b"wc-status" if in_entry => {
                    for attr in e.attributes().flatten() {
                        match attr.key.as_ref() {
                            b"item" => {
                                status_code = String::from_utf8_lossy(&attr.value).to_string();
                            }
                            b"props" => {
                                prop_status = String::from_utf8_lossy(&attr.value).to_string();
                            }
                            b"tree-conflicted" => tree_conflicted = attr.value.as_ref() == b"true",
                            b"locked" => {
                                locked = attr.value.as_ref() == b"true";
                            }
                            b"switched" => {
                                switched = attr.value.as_ref() == b"true";
                            }
                            b"history" | b"copied" => {
                                history = attr.value.as_ref() == b"true";
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::End(ref e)) => {
                if e.name().as_ref() == b"entry" && in_entry {
                    if tree_conflicted {
                        status_code = "conflicted".into();
                    }
                    statuses.push(SvnStatus {
                        path: current_path.clone(),
                        directory: false,
                        status: status_code.clone(),
                        status_code: status_code.clone(),
                        prop_status: if prop_status.is_empty() {
                            "none".to_string()
                        } else {
                            prop_status.clone()
                        },
                        locked,
                        switched,
                        history,
                    });
                    in_entry = false;
                    current_path.clear();
                    status_code.clear();
                    prop_status.clear();
                    locked = false;
                    switched = false;
                    history = false;
                    tree_conflicted = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(SvnError::ParseError(e.to_string())),
            _ => {}
        }
        buf.clear();
    }

    Ok(statuses)
}

pub fn parse_log_xml(xml: &str) -> Result<Vec<SvnLogEntry>, SvnError> {
    let mut entries = Vec::new();
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut in_logentry = false;
    let mut in_author = false;
    let mut in_date = false;
    let mut in_msg = false;
    let mut in_path = false;

    let mut revision: u64 = 0;
    let mut author = String::new();
    let mut date = String::new();
    let mut message = String::new();
    let mut changed_paths: Vec<SvnLogPath> = Vec::new();
    let mut path_action = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => match e.name().as_ref() {
                b"logentry" => {
                    in_logentry = true;
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"revision" {
                            revision = String::from_utf8_lossy(&attr.value).parse().unwrap_or(0);
                        }
                    }
                }
                b"author" if in_logentry => in_author = true,
                b"date" if in_logentry => in_date = true,
                b"msg" if in_logentry => in_msg = true,
                b"path" if in_logentry => {
                    in_path = true;
                    path_action.clear();
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"action" {
                            path_action = String::from_utf8_lossy(&attr.value).to_string();
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                if in_author {
                    author.push_str(&text);
                } else if in_date {
                    date.push_str(&text);
                } else if in_msg {
                    message.push_str(&text);
                } else if in_path {
                    changed_paths.push(SvnLogPath {
                        path: text,
                        action: path_action.clone(),
                    });
                }
            }
            Ok(Event::End(ref e)) => match e.name().as_ref() {
                b"author" => in_author = false,
                b"date" => in_date = false,
                b"msg" => in_msg = false,
                b"path" => {
                    in_path = false;
                    path_action.clear();
                }
                b"logentry" => {
                    entries.push(SvnLogEntry {
                        revision,
                        author: std::mem::take(&mut author),
                        date: std::mem::take(&mut date),
                        message: std::mem::take(&mut message),
                        changed_paths: std::mem::take(&mut changed_paths),
                    });
                    revision = 0;
                    in_logentry = false;
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(SvnError::ParseError(e.to_string())),
            _ => {}
        }
        buf.clear();
    }

    Ok(entries)
}

pub fn parse_info_xml(xml: &str) -> Result<SvnInfo, SvnError> {
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut path_val = String::new();
    let mut url = String::new();
    let mut repository_root = String::new();
    let mut revision: u64 = 0;
    let mut node_kind = String::new();
    let mut schedule = String::new();

    let mut in_entry = false;
    let mut in_wc_info = false;
    let mut current_tag = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag.as_str() {
                    "entry" => {
                        in_entry = true;
                        for attr in e.attributes().flatten() {
                            match String::from_utf8_lossy(attr.key.as_ref()).as_ref() {
                                "path" => {
                                    path_val = attr
                                        .unescape_value()
                                        .map_err(|e| SvnError::ParseError(e.to_string()))?
                                        .into_owned()
                                }
                                "kind" => {
                                    node_kind = String::from_utf8_lossy(&attr.value).to_string()
                                }
                                "revision" => {
                                    revision =
                                        String::from_utf8_lossy(&attr.value).parse().unwrap_or(0)
                                }
                                _ => {}
                            }
                        }
                    }
                    "wc-info" if in_entry => in_wc_info = true,
                    "commit" if in_entry => {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"revision" && revision == 0 {
                                revision =
                                    String::from_utf8_lossy(&attr.value).parse().unwrap_or(0);
                            }
                        }
                    }
                    "url" | "root" | "schedule" => {
                        current_tag = tag;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                match current_tag.as_str() {
                    "url" => url = text,
                    "root" => repository_root = text,
                    "schedule" if in_wc_info => schedule = text,
                    _ => {}
                }
                current_tag.clear();
            }
            Ok(Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag.as_str() {
                    "wc-info" => in_wc_info = false,
                    "entry" => in_entry = false,
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(SvnError::ParseError(e.to_string())),
            _ => {}
        }
        buf.clear();
    }

    if schedule.is_empty() {
        schedule = "normal".to_string();
    }

    Ok(SvnInfo {
        path: path_val,
        url,
        repository_root,
        revision,
        node_kind,
        schedule,
    })
}

pub fn parse_blame_text(output: &str) -> Result<Vec<crate::svn::BlameLine>, SvnError> {
    let mut lines = Vec::new();

    for line in output.lines() {
        // SVN prints a padded revision, one space, a ten-character author
        // column, one space, then the source line exactly as it appears.
        let trimmed = line.trim_start_matches(' ');
        let Some((revision_text, rest)) = trimmed.split_once(' ') else {
            continue;
        };
        let revision = match revision_text {
            "-" => 0,
            value => match value.parse::<u64>() {
                Ok(revision) => revision,
                Err(_) => continue,
            },
        };
        let mut author_column = rest.chars();
        let author: String = author_column.by_ref().take(10).collect();
        if author.chars().count() != 10 || author_column.next() != Some(' ') {
            continue;
        }
        lines.push(crate::svn::BlameLine {
            revision,
            author: author.trim().to_string(),
            line: author_column.collect(),
        });
    }

    Ok(lines)
}

#[derive(Default, Debug)]
pub(super) struct PendingPath {
    pub path: String,
    pub base: u64,
    pub incoming: bool,
    pub subtree: bool,
    pub switched: bool,
}

pub(super) fn parse_incoming_status_xml(xml: &str) -> Result<(u64, Vec<PendingPath>), SvnError> {
    let mut reader = Reader::from_str(xml);
    let mut current = PendingPath::default();
    let mut pending = Vec::new();
    let mut head = 0;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e) | Event::Empty(e)) => {
                for attr in e.attributes() {
                    let attr = attr.map_err(|e| SvnError::ParseError(e.to_string()))?;
                    let value = attr
                        .unescape_value()
                        .map_err(|e| SvnError::ParseError(e.to_string()))?;
                    match (e.name().as_ref(), attr.key.as_ref()) {
                        (b"entry", b"path") => {
                            current.path = value.into_owned();
                            #[cfg(windows)]
                            {
                                current.path = current.path.replace('\\', "/");
                            }
                        }
                        (b"wc-status", b"revision") => current.base = value.parse().unwrap_or(0),
                        (b"wc-status", b"switched") => current.switched = value == "true",
                        (b"repos-status", b"item" | b"props") => {
                            current.incoming |= !matches!(value.as_ref(), "none" | "normal" | "");
                            current.subtree |= attr.key.as_ref() == b"item"
                                && matches!(value.as_ref(), "added" | "deleted" | "replaced");
                        }
                        (b"against", b"revision") => {
                            head = value.parse().map_err(|e: std::num::ParseIntError| {
                                SvnError::ParseError(e.to_string())
                            })?
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"entry" => {
                // Keep switched roots too: descendants use their effective URL.
                if current.incoming || current.switched {
                    pending.push(std::mem::take(&mut current));
                } else {
                    current = PendingPath::default();
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(SvnError::ParseError(e.to_string())),
            _ => {}
        }
    }
    Ok((head, pending))
}

#[cfg(test)]
mod tests {
    #[test]
    fn incoming_status_ignores_local_changes_and_uses_each_nodes_base() {
        let (head, entries) = parse_incoming_status_xml(
            r#"<status><target path=".">
          <entry path="."><wc-status item="normal" revision="4"/></entry>
          <entry path="own.txt"><wc-status item="modified" revision="7"/>
            <repos-status item="none" props="none"><lock/></repos-status></entry>
          <entry path="remote&amp;.txt"><wc-status item="normal" revision="3"/>
            <repos-status item="modified" props="none"/></entry>
          <entry path="new"><wc-status item="none"/>
            <repos-status item="added" props="none"/></entry>
          <entry path="property"><wc-status item="normal" revision="6"/>
            <repos-status item="none" props="modified"/></entry>
          <against revision="8"/></target></status>"#,
        )
        .unwrap();
        assert_eq!(head, 8);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].path, "remote&.txt");
        assert_eq!(entries[0].base, 3);
        assert_eq!(entries[1].base, 0);
        assert!(entries[1].subtree);
        assert_eq!(entries[2].base, 6);
        assert!(!entries[2].subtree);
    }

    #[cfg(windows)]
    #[test]
    fn status_paths_normalize_windows_separators() {
        let xml = r#"<status><target path="."><entry path="src\sub\file@name.txt"><wc-status item="modified" props="none" /></entry></target></status>"#;
        let entries = super::parse_status_xml(xml).unwrap();
        assert_eq!(entries[0].path, "src/sub/file@name.txt");
    }

    use super::*;

    #[test]
    fn test_parse_status_xml_single_file() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<status>
<target path=".">
<entry path="src/main.rs">
<wc-status item="modified" props="none" revision="42"/>
</entry>
</target>
</status>"#;

        let result = parse_status_xml(xml).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].path, "src/main.rs");
        assert_eq!(result[0].status_code, "modified");
        assert!(!result[0].locked);
    }

    #[test]
    fn test_parse_status_xml_multiple_files() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<status>
<target path=".">
<entry path="a.rs"><wc-status item="modified" props="none"/></entry>
<entry path="b.txt"><wc-status item="unversioned" props="none"/></entry>
<entry path="c.txt"><wc-status item="deleted" props="none"/></entry>
</target>
</status>"#;

        let result = parse_status_xml(xml).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].status_code, "modified");
        assert_eq!(result[1].status_code, "unversioned");
        assert_eq!(result[2].status_code, "deleted");
    }

    #[test]
    fn test_parse_status_xml_empty() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<status><target path="."></target></status>"#;
        let result = parse_status_xml(xml).unwrap();
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn status_paths_decode_xml_entities() {
        let xml = r#"<status><target path="."><entry path="a&amp;b&lt;c&gt;.txt"><wc-status item="modified" props="none"/></entry></target></status>"#;
        let result = parse_status_xml(xml).unwrap();
        assert_eq!(result[0].path, "a&b<c>.txt");
    }

    #[test]
    fn test_parse_log_xml_single_entry() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="100">
<author>john</author>
<date>2024-01-15T10:30:00Z</date>
<paths><path action="M">/trunk/src/main.rs</path></paths>
<msg>Fix bug</msg>
</logentry>
</log>"#;

        let result = parse_log_xml(xml).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].revision, 100);
        assert_eq!(result[0].author, "john");
        assert_eq!(result[0].message, "Fix bug");
        assert_eq!(result[0].changed_paths.len(), 1);
        assert_eq!(result[0].changed_paths[0].action, "M");
        assert_eq!(result[0].changed_paths[0].path, "/trunk/src/main.rs");
    }

    #[test]
    fn test_parse_log_xml_multiple_entries() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="100"><author>john</author><date>2024-01-15Z</date><msg>Fix</msg></logentry>
<logentry revision="99"><author>jane</author><date>2024-01-14Z</date><msg>Add</msg></logentry>
</log>"#;

        let result = parse_log_xml(xml).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].revision, 100);
        assert_eq!(result[1].revision, 99);
    }

    #[test]
    fn test_parse_info_xml() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<info>
<entry path="." kind="dir">
<url>https://svn.example.com/repo/trunk</url>
<repository><root>https://svn.example.com/repo</root></repository>
<wc-info><schedule>normal</schedule></wc-info>
<commit revision="42"><author>john</author></commit>
</entry>
</info>"#;

        let result = parse_info_xml(xml).unwrap();
        assert_eq!(result.url, "https://svn.example.com/repo/trunk");
        assert_eq!(result.repository_root, "https://svn.example.com/repo");
        assert_eq!(result.revision, 42);
        assert_eq!(result.node_kind, "dir");
        assert_eq!(result.schedule, "normal");
    }

    #[test]
    fn test_parse_blame_text() {
        let output =
            "     1       john First line\n     2       jane Second line\n    10       john Modified";
        let result = parse_blame_text(output).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].revision, 1);
        assert_eq!(result[0].author, "john");
        assert_eq!(result[0].line, "First line");
    }

    #[test]
    fn blame_preserves_indentation_blank_lines_and_uncommitted_lines() {
        let output =
            "     1       john     indented  \n     2       jane \n     -          - local change";
        let result = parse_blame_text(output).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].line, "    indented  ");
        assert_eq!(result[1].line, "");
        assert_eq!(result[2].revision, 0);
        assert_eq!(result[2].line, "local change");
    }

    #[test]
    fn test_parse_blame_text_empty() {
        let result = parse_blame_text("").unwrap();
        assert_eq!(result.len(), 0);
    }
}
