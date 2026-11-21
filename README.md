# excalidraw-local

Excalidraw as a local diagram library for documentation. Drawings are plain
`.excalidraw` files, and the desktop app opens any folder like an editor does:
a docs folder, a git repo, anything.

Runs as a **desktop app** (Rust/Tauri, no server) or as a **self-hosted web app**
(Next.js + Docker).

## Features

- **Open any folder or file** (desktop): folder switcher with recent folders,
  Open file…, Save as…, `excalidraw-local <folder|file>`, and "Open with" for
  `.excalidraw` files in your file manager
- **Library** with thumbnails, folders, and recently edited drawings
- **Full-text search** across file names, folders, and the text inside drawings (`/`)
- **Jump to any drawing** with `Ctrl+P`
- **Autosave** when the drawing changes; `Ctrl+S` saves immediately
- **Rename / move / duplicate / delete** (desktop: system trash; web: `.trash/` in the drawings folder)
- **Synced exports for docs**: toggle SVG and/or PNG per drawing and an image is
  written next to the file (`diagram.excalidraw` → `diagram.svg`) on every save,
  ready to embed: `![diagram](./diagram.svg)`. Exported SVGs load fonts from a
  public CDN so they render on GitHub and in any browser.
- Works offline (Excalidraw fonts are bundled)

Shortcuts: `Ctrl+N` new drawing · `Ctrl+P` jump to drawing · `Ctrl+S` save ·
`/` search · desktop: `Ctrl+O` open file · `Ctrl+Shift+O` open folder ·
`Ctrl+Shift+S` save as

The desktop app writes nothing into your folders except your drawings and the
exports you turn on; thumbnails are cached in `~/.cache/excalidraw-local`.

## Desktop app (Linux)

Requires Node, Rust, and WebKitGTK 4.1 (`webkit2gtk-4.1`).

```bash
npm ci
npm run desktop:install   # builds and copies the binary to ~/.local/bin/excalidraw-local
```

```bash
excalidraw-local                      # reopens the last folder
excalidraw-local ~/work/repo/docs     # open a folder
excalidraw-local ~/notes/flow.excalidraw   # open (or create) a file
```

The last and recent folders are kept in `~/.config/excalidraw-local/config.json`
(first run: `~/Documents/excalidraw`, or `DRAWINGS_ROOT`).

For "Open with" in file managers, register the file type once:

```bash
mkdir -p ~/.local/share/mime/packages
cat > ~/.local/share/mime/packages/excalidraw-local.xml <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/vnd.excalidraw+json">
    <comment>Excalidraw drawing</comment>
    <sub-class-of type="application/json"/>
    <glob pattern="*.excalidraw"/>
  </mime-type>
</mime-info>
XML
update-mime-database ~/.local/share/mime
```

and use a desktop entry with `Exec=excalidraw-local %f` and
`MimeType=application/vnd.excalidraw+json;inode/directory;`.

How it works: the Next.js UI is built as a static export (`STATIC_EXPORT=1`) and
embedded in a small Tauri binary. File operations are Tauri commands in
`src-tauri/src/main.rs`; `lib/storage.ts` calls them, or falls back to
`POST /api/fs` on the web.

## Web app

```bash
cp .env.example .env     # DRAWINGS_ROOT=/srv/excalidraw/drawings
npm ci
npm run dev              # http://localhost:3000
```

Or use the `Dockerfile` / `docker-compose.yml`; the compose file mounts
`/srv/excalidraw/drawings` from the host. All file operations go through
`POST /api/fs` (`pages/api/fs.ts`, implemented in `lib/fsOps.ts`) and are
confined to `DRAWINGS_ROOT`.
