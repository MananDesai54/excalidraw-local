// Desktop shell for excalidraw-local.
//
// The Next.js frontend is built as a static export (STATIC_EXPORT=1) and
// embedded in the binary. Drawings are read and written directly on the
// filesystem through Tauri commands (see lib/storage.ts on the JS side).
// No HTTP server, no open port.

use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde_json::{json, Value};

/// Drawings folder: $DRAWINGS_ROOT, else ~/Documents/excalidraw.
fn drawings_root() -> PathBuf {
    if let Ok(p) = std::env::var("DRAWINGS_ROOT") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Documents").join("excalidraw")
}

/// Resolve a client path like `/team/foo.excalidraw` under the drawings root,
/// rejecting anything that would escape it.
fn safe_resolve(p: &str) -> Result<PathBuf, String> {
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

fn blank_drawing() -> Value {
    json!({
        "type": "excalidraw",
        "version": 2,
        "elements": [],
        "appState": { "viewBackgroundColor": "#ffffff" },
        "files": {}
    })
}

fn write_pretty(full: &Path, v: &Value, create_new: bool) -> Result<(), String> {
    if let Some(dir) = full.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(v).map_err(|e| e.to_string())?;
    let mut opts = fs::OpenOptions::new();
    opts.write(true);
    if create_new {
        opts.create_new(true);
    } else {
        opts.create(true).truncate(true);
    }
    let mut f = opts.open(full).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir(dir: String) -> Result<Vec<Value>, String> {
    fs::create_dir_all(drawings_root()).map_err(|e| e.to_string())?;
    let full = safe_resolve(&dir)?;
    let mut out = Vec::new();
    for e in fs::read_dir(&full).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let md = fs::metadata(e.path()).map_err(|e| e.to_string())?;
        let mtime = md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(json!({
            "name": e.file_name().to_string_lossy(),
            "isDir": md.is_dir(),
            "size": md.len(),
            "mtime": mtime,
        }));
    }
    Ok(out)
}

/// Create a new file (error if it already exists); parent dirs are created.
#[tauri::command]
fn create_file(path: String, template: Option<Value>) -> Result<(), String> {
    let template = template.unwrap_or_else(|| {
        json!({ "type": "excalidraw", "version": 2, "elements": [], "appState": {}, "files": {} })
    });
    write_pretty(&safe_resolve(&path)?, &template, true)
}

/// Read a drawing; a missing or unreadable file yields a blank scene.
#[tauri::command]
fn read_drawing(path: String) -> Result<Value, String> {
    let full = safe_resolve(&path)?;
    Ok(fs::read(&full)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(blank_drawing))
}

#[tauri::command]
fn save_drawing(path: String, data: Value) -> Result<(), String> {
    write_pretty(&safe_resolve(&path)?, &data, false)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_dir,
            create_file,
            read_drawing,
            save_drawing
        ])
        .run(tauri::generate_context!())
        .expect("error while running excalidraw-local");
}
