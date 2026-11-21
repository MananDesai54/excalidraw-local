// Desktop shell for excalidraw-local.
//
// The Next.js frontend is built as a static export (STATIC_EXPORT=1) and
// embedded in the binary. Drawings are read and written directly on the
// filesystem through Tauri commands (see lib/storage.ts on the JS side).
// The same core operations exist for the web build in lib/fsOps.ts.
// No HTTP server, no open port.
//
// Like an editor, the app works on one open folder (the "workspace") at a
// time. Any folder can be opened (dialog, recent list, or CLI argument), and
// opening or saving a file elsewhere switches to that file's folder.
// Client paths ("/sub/diagram.excalidraw") are relative to the workspace.

use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::Write,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};

use base64::Engine;
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MAX_RECENTS: usize = 12;
/// Folders never worth walking when a code repo is opened as a workspace.
const SKIP_DIRS: &[&str] = &["node_modules", "target", "dist", "build", "out", "vendor"];

static ROOT: Mutex<Option<PathBuf>> = Mutex::new(None);
/// File passed on the command line, opened once on startup.
static LAUNCH: Mutex<Option<String>> = Mutex::new(None);

type Res<T> = Result<T, String>;

fn err<E: ToString>(e: E) -> String {
    e.to_string()
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()))
}

fn xdg(var: &str, fallback: &str) -> PathBuf {
    std::env::var(var)
        .map(PathBuf::from)
        .unwrap_or_else(|_| home().join(fallback))
        .join("excalidraw-local")
}

fn config_path() -> PathBuf {
    xdg("XDG_CONFIG_HOME", ".config").join("config.json")
}

fn read_config() -> Value {
    fs::read(config_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_config(cfg: &Value) {
    let _ = write_bytes(
        &config_path(),
        &serde_json::to_vec_pretty(cfg).unwrap_or_default(),
        false,
    );
}

fn default_root() -> PathBuf {
    if let Ok(p) = std::env::var("DRAWINGS_ROOT") {
        return PathBuf::from(p);
    }
    if let Some(p) = read_config().get("root").and_then(Value::as_str) {
        if Path::new(p).is_dir() {
            return PathBuf::from(p);
        }
    }
    home().join("Documents").join("excalidraw")
}

fn root() -> PathBuf {
    let mut r = ROOT.lock().unwrap();
    r.get_or_insert_with(default_root).clone()
}

/// Switch the workspace and remember it as most recent.
fn set_workspace(dir: &Path) -> Res<String> {
    let dir = fs::canonicalize(dir).map_err(err)?;
    if !dir.is_dir() {
        return Err(format!("{} is not a folder", dir.display()));
    }
    let s = dir.to_string_lossy().into_owned();
    *ROOT.lock().unwrap() = Some(dir);
    let mut cfg = read_config();
    let mut recents: Vec<String> = cfg
        .get("recent")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    recents.retain(|r| r != &s);
    recents.insert(0, s.clone());
    recents.truncate(MAX_RECENTS);
    cfg["root"] = json!(s);
    cfg["recent"] = json!(recents);
    write_config(&cfg);
    Ok(s)
}

/// Resolve a client path like `/team/foo.excalidraw` under the workspace,
/// rejecting anything that would escape it.
fn safe_resolve(p: &str) -> Res<PathBuf> {
    let mut full = root();
    for c in Path::new(p.trim_start_matches('/')).components() {
        match c {
            Component::Normal(s) => full.push(s),
            Component::CurDir => {}
            _ => return Err("Invalid path".into()),
        }
    }
    Ok(full)
}

/// Absolute path → (workspace = its folder, client path "/name").
fn open_abs_file(abs: &Path) -> Res<String> {
    let parent = abs.parent().ok_or("File has no folder")?;
    set_workspace(parent)?;
    let name = abs.file_name().ok_or("Invalid file")?.to_string_lossy();
    Ok(format!("/{name}"))
}

/// Thumbnails live in ~/.cache, keyed by workspace, so opened folders stay clean.
fn thumbs_dir() -> PathBuf {
    let mut h = DefaultHasher::new();
    root().hash(&mut h);
    xdg("XDG_CACHE_HOME", ".cache")
        .join("thumbs")
        .join(format!("{:016x}", h.finish()))
}

fn thumb_rel(p: &str) -> Res<PathBuf> {
    let mut out = thumbs_dir();
    for c in Path::new(p.trim_start_matches('/')).components() {
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            _ => return Err("Invalid path".into()),
        }
    }
    Ok(out)
}

fn thumb_path(p: &str) -> Res<PathBuf> {
    let mut t = thumb_rel(p)?;
    let name = format!("{}.svg", t.file_name().unwrap_or_default().to_string_lossy());
    t.set_file_name(name);
    Ok(t)
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

// ---------------------------------------------------------------- workspace

#[tauri::command]
fn get_root() -> String {
    root().to_string_lossy().into_owned()
}

#[tauri::command]
fn get_recents() -> Vec<String> {
    read_config()
        .get("recent")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .filter(|p| Path::new(p).is_dir())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn forget_recent(path: String) {
    let mut cfg = read_config();
    if let Some(a) = cfg.get_mut("recent").and_then(Value::as_array_mut) {
        a.retain(|v| v.as_str() != Some(path.as_str()));
    }
    write_config(&cfg);
}

/// Open a folder as the workspace. Without `path`, shows a folder picker
/// (which can also create folders). Returns None if cancelled.
#[tauri::command]
async fn open_folder(app: AppHandle, path: Option<String>) -> Res<Option<String>> {
    let dir = match path {
        Some(p) => PathBuf::from(p),
        None => {
            let picked = app
                .dialog()
                .file()
                .set_title("Open folder")
                .set_directory(root())
                .blocking_pick_folder();
            match picked.and_then(|f| f.into_path().ok()) {
                Some(p) => p,
                None => return Ok(None),
            }
        }
    };
    fs::create_dir_all(&dir).map_err(err)?;
    set_workspace(&dir).map(Some)
}

/// Pick any .excalidraw file; its folder becomes the workspace.
/// Returns the client path to open, or None if cancelled.
#[tauri::command]
async fn open_file(app: AppHandle) -> Res<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Open drawing")
        .add_filter("Excalidraw", &["excalidraw"])
        .set_directory(root())
        .blocking_pick_file();
    match picked.and_then(|f| f.into_path().ok()) {
        Some(p) => open_abs_file(&p).map(Some),
        None => Ok(None),
    }
}

/// Save a drawing anywhere; the target's folder becomes the workspace.
#[tauri::command]
async fn save_as(app: AppHandle, name: String, data: Value) -> Res<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Save drawing as")
        .add_filter("Excalidraw", &["excalidraw"])
        .set_directory(root())
        .set_file_name(&name)
        .blocking_save_file();
    let Some(mut p) = picked.and_then(|f| f.into_path().ok()) else {
        return Ok(None);
    };
    if p.extension().and_then(|e| e.to_str()) != Some("excalidraw") {
        let n = format!("{}.excalidraw", p.file_name().unwrap_or_default().to_string_lossy());
        p.set_file_name(n);
    }
    write_pretty(&p, &data, false)?;
    open_abs_file(&p).map(Some)
}

/// File given on the command line, if any (returned once).
#[tauri::command]
fn take_launch() -> Option<String> {
    LAUNCH.lock().unwrap().take()
}

// ---------------------------------------------------------------- files

#[tauri::command]
fn list_dir(dir: String) -> Res<Vec<Value>> {
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

/// Every drawing under the workspace, with its text, for the library and search.
#[tauri::command]
fn scan() -> Res<Vec<Value>> {
    let root = root();
    let mut out = Vec::new();
    let mut stack = vec![(root.clone(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let p = e.path();
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                if depth < 12 && !SKIP_DIRS.contains(&name.as_str()) {
                    stack.push((p, depth + 1));
                }
                continue;
            }
            if !name.ends_with(".excalidraw") {
                continue;
            }
            let Ok(md) = fs::metadata(&p) else { continue };
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

/// Rename or move a file or folder within the workspace. Fails if the target exists.
#[tauri::command]
fn rename(from: String, to: String) -> Res<()> {
    let src = safe_resolve(&from)?;
    let dst = safe_resolve(&to)?;
    if src == root() {
        return Err("Cannot rename the open folder".into());
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
        (thumb_rel(&from)?, thumb_rel(&to)?)
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

/// Move a file or folder to the system trash.
#[tauri::command]
fn trash(path: String) -> Res<()> {
    let src = safe_resolve(&path)?;
    if src == root() {
        return Err("Cannot delete the open folder".into());
    }
    trash::delete(&src).map_err(err)?;
    if let Ok(t) = thumb_path(&path) {
        let _ = fs::remove_file(t);
    }
    Ok(())
}

/// `excalidraw-local [folder | file.excalidraw]`
fn handle_cli_arg() {
    let Some(arg) = std::env::args().skip(1).find(|a| !a.starts_with('-')) else {
        return;
    };
    let p = PathBuf::from(arg.strip_prefix("file://").unwrap_or(&arg));
    let p = if p.is_absolute() {
        p
    } else {
        std::env::current_dir().unwrap_or_default().join(p)
    };
    if p.is_dir() {
        let _ = set_workspace(&p);
    } else if p.extension().and_then(|e| e.to_str()) == Some("excalidraw") {
        // New file paths are fine too: it opens blank and is created on first save.
        if let Some(parent) = p.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(rel) = open_abs_file(&p) {
            *LAUNCH.lock().unwrap() = Some(rel);
        }
    }
}

fn main() {
    handle_cli_arg();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_root,
            get_recents,
            forget_recent,
            open_folder,
            open_file,
            save_as,
            take_launch,
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
