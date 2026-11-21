// Desktop shell for excalidraw-local.
//
// The Next.js frontend is built as a static export (STATIC_EXPORT=1) and
// embedded in the binary. Drawings are read and written directly on the
// filesystem through Tauri commands (see lib/storage.ts on the JS side).
// The same operations exist for the web build in lib/fsOps.ts.
// No HTTP server, no open port.

use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::Engine;
use serde_json::{json, Value};

const THUMBS: &str = ".thumbs";
const TRASH: &str = ".trash";

type Res<T> = Result<T, String>;

fn err<E: ToString>(e: E) -> String {
    e.to_string()
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()))
}

fn config_path() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home().join(".config"));
    base.join("excalidraw-local").join("config.json")
}

fn read_config() -> Value {
    fs::read(config_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_else(|| json!({}))
}

/// Drawings folder: $DRAWINGS_ROOT, else config "root", else ~/Documents/excalidraw.
fn drawings_root() -> PathBuf {
    if let Ok(p) = std::env::var("DRAWINGS_ROOT") {
        return PathBuf::from(p);
    }
    if let Some(p) = read_config().get("root").and_then(Value::as_str) {
        return PathBuf::from(p);
    }
    home().join("Documents").join("excalidraw")
}

/// Resolve a client path like `/team/foo.excalidraw` under the drawings root,
/// rejecting anything that would escape it.
fn safe_resolve(p: &str) -> Res<PathBuf> {
    let mut full = drawings_root();
    for c in Path::new(p.trim_start_matches('/')).components() {
        match c {
            Component::Normal(s) => full.push(s),
            Component::CurDir => {}
            _ => return Err("Invalid path".into()),
        }
    }
    Ok(full)
}

fn thumb_path(p: &str) -> Res<PathBuf> {
    safe_resolve(&format!("/{THUMBS}/{}.svg", p.trim_start_matches('/')))
}

fn mtime_ms(md: &fs::Metadata) -> u64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn blank_drawing() -> Value {
    json!({
        "type": "excalidraw",
        "version": 2,
        "elements": [],
        "appState": { "viewBackgroundColor": "#ffffff" },
        "files": {}
    })
}

fn write_bytes(full: &Path, bytes: &[u8], create_new: bool) -> Res<()> {
    if let Some(dir) = full.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    let mut opts = fs::OpenOptions::new();
    opts.write(true);
    if create_new {
        opts.create_new(true);
    } else {
        opts.create(true).truncate(true);
    }
    opts.open(full).map_err(err)?.write_all(bytes).map_err(err)
}

fn write_pretty(full: &Path, v: &Value, create_new: bool) -> Res<()> {
    write_bytes(full, &serde_json::to_vec_pretty(v).map_err(err)?, create_new)
}

/// Text content of a drawing, used for full-text search.
fn drawing_text(v: &Value) -> String {
    let mut parts = Vec::new();
    if let Some(els) = v.get("elements").and_then(Value::as_array) {
        for el in els {
            if el.get("isDeleted").and_then(Value::as_bool) == Some(true) {
                continue;
            }
            let t = match el.get("type").and_then(Value::as_str) {
                Some("text") => el.get("text").or_else(|| el.get("originalText")),
                Some("frame") | Some("magicframe") => el.get("name"),
                _ => None,
            };
            if let Some(s) = t.and_then(Value::as_str) {
                if !s.trim().is_empty() {
                    parts.push(s.replace('\n', " "));
                }
            }
        }
    }
    let mut s = parts.join(" · ");
    if s.len() > 4000 {
        let mut cut = 4000;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        s.truncate(cut);
    }
    s
}

#[tauri::command]
fn get_root() -> String {
    drawings_root().to_string_lossy().into_owned()
}

#[tauri::command]
fn set_root(root: String) -> Res<String> {
    let root = root.trim();
    let expanded = match root.strip_prefix("~/") {
        Some(rest) => home().join(rest),
        None => PathBuf::from(root),
    };
    if !expanded.is_absolute() {
        return Err("Folder must be an absolute path".into());
    }
    fs::create_dir_all(&expanded).map_err(err)?;
    let mut cfg = read_config();
    cfg["root"] = json!(expanded.to_string_lossy());
    write_pretty(&config_path(), &cfg, false)?;
    Ok(get_root())
}

#[tauri::command]
fn list_dir(dir: String) -> Res<Vec<Value>> {
    fs::create_dir_all(drawings_root()).map_err(err)?;
    let full = safe_resolve(&dir)?;
    let mut out = Vec::new();
    for e in fs::read_dir(&full).map_err(err)? {
        let e = e.map_err(err)?;
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let md = fs::metadata(e.path()).map_err(err)?;
        out.push(json!({
            "name": name,
            "isDir": md.is_dir(),
            "size": md.len(),
            "mtime": mtime_ms(&md),
        }));
    }
    Ok(out)
}

/// Every drawing under the root, with its text, for the library and search.
#[tauri::command]
fn scan() -> Res<Vec<Value>> {
    let root = drawings_root();
    fs::create_dir_all(&root).map_err(err)?;
    let mut out = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let p = e.path();
            let Ok(md) = fs::metadata(&p) else { continue };
            if md.is_dir() {
                stack.push(p);
                continue;
            }
            if !name.ends_with(".excalidraw") {
                continue;
            }
            let rel = format!(
                "/{}",
                p.strip_prefix(&root).unwrap_or(&p).to_string_lossy()
            );
            let text = fs::read(&p)
                .ok()
                .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                .map(|v| drawing_text(&v))
                .unwrap_or_default();
            let thumb_mtime = thumb_path(&rel)
                .ok()
                .and_then(|t| fs::metadata(t).ok())
                .map(|m| mtime_ms(&m))
                .unwrap_or(0);
            out.push(json!({
                "path": rel,
                "name": name,
                "size": md.len(),
                "mtime": mtime_ms(&md),
                "thumbMtime": thumb_mtime,
                "text": text,
            }));
        }
    }
    Ok(out)
}

/// Create a new file (error if it already exists); parent dirs are created.
#[tauri::command]
fn create_file(path: String, template: Option<Value>) -> Res<()> {
    let template = template.unwrap_or_else(|| {
        json!({ "type": "excalidraw", "version": 2, "elements": [], "appState": {}, "files": {} })
    });
    write_pretty(&safe_resolve(&path)?, &template, true)
}

#[tauri::command]
fn create_dir(path: String) -> Res<()> {
    fs::create_dir_all(safe_resolve(&path)?).map_err(err)
}

/// Read a drawing; a missing or unreadable file yields a blank scene.
#[tauri::command]
fn read_drawing(path: String) -> Res<Value> {
    let full = safe_resolve(&path)?;
    Ok(fs::read(&full)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(blank_drawing))
}

#[tauri::command]
fn save_drawing(path: String, data: Value) -> Res<()> {
    write_pretty(&safe_resolve(&path)?, &data, false)
}

/// Write a sidecar file (SVG/PNG export). `base64` content is decoded first.
#[tauri::command]
fn write_file(path: String, content: String, base64: Option<bool>) -> Res<String> {
    let full = safe_resolve(&path)?;
    let bytes = if base64.unwrap_or(false) {
        base64::engine::general_purpose::STANDARD
            .decode(content)
            .map_err(err)?
    } else {
        content.into_bytes()
    };
    write_bytes(&full, &bytes, false)?;
    Ok(full.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_thumb(path: String) -> Option<String> {
    fs::read_to_string(thumb_path(&path).ok()?).ok()
}

#[tauri::command]
fn write_thumb(path: String, svg: String) -> Res<()> {
    write_bytes(&thumb_path(&path)?, svg.as_bytes(), false)
}

/// Rename or move a file or folder. Fails if the target exists.
#[tauri::command]
fn rename(from: String, to: String) -> Res<()> {
    let src = safe_resolve(&from)?;
    let dst = safe_resolve(&to)?;
    if src == drawings_root() {
        return Err("Cannot rename the root folder".into());
    }
    if dst.exists() {
        return Err(format!("{to} already exists"));
    }
    if let Some(dir) = dst.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    fs::rename(&src, &dst).map_err(err)?;
    // Thumbnails follow the file (folders: the whole thumb subtree).
    let (ts, td) = if dst.is_dir() {
        (
            safe_resolve(&format!("/{THUMBS}{from}"))?,
            safe_resolve(&format!("/{THUMBS}{to}"))?,
        )
    } else {
        (thumb_path(&from)?, thumb_path(&to)?)
    };
    if ts.exists() {
        if let Some(dir) = td.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::rename(ts, td);
    }
    Ok(())
}

/// Move a file or folder into <root>/.trash instead of deleting it.
#[tauri::command]
fn trash(path: String) -> Res<()> {
    let src = safe_resolve(&path)?;
    if src == drawings_root() {
        return Err("Cannot delete the root folder".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let base = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let dst = drawings_root().join(TRASH).join(format!("{stamp}-{base}"));
    fs::create_dir_all(dst.parent().unwrap()).map_err(err)?;
    fs::rename(&src, &dst).map_err(err)?;
    if let Ok(t) = thumb_path(&path) {
        let _ = fs::remove_file(t);
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_root,
            set_root,
            list_dir,
            scan,
            create_file,
            create_dir,
            read_drawing,
            save_drawing,
            write_file,
            read_thumb,
            write_thumb,
            rename,
            trash
        ])
        .run(tauri::generate_context!())
        .expect("error while running excalidraw-local");
}
