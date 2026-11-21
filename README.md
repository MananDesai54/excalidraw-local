# excalidraw-local

Excalidraw as a local diagram library for documentation. Drawings are plain
`.excalidraw` files in a folder you choose (a docs folder, a git repo, …).

Runs as a **desktop app** (Rust/Tauri, no server) or as a **self-hosted web app**
(Next.js + Docker).

## Features

- **Library** with thumbnails, folders, and recently edited drawings
- **Full-text search** across file names, folders, and the text inside drawings (`/`)
- **Jump to any drawing** with `Ctrl+P`
- **Autosave** when the drawing changes; `Ctrl+S` saves immediately
- **Rename / move / duplicate / delete** (deleted items go to `.trash/` in the drawings folder)
- **Synced exports for docs**: toggle SVG and/or PNG per drawing and an image is
  written next to the file (`diagram.excalidraw` → `diagram.svg`) on every save,
  ready to embed: `![diagram](./diagram.svg)`. Exported SVGs load fonts from a
  public CDN so they render on GitHub and in any browser.
- Works offline (Excalidraw fonts are bundled)

Shortcuts: `Ctrl+N` new drawing · `Ctrl+P` / `Ctrl+O` jump to drawing ·
`Ctrl+S` save · `/` search

App data lives in the drawings folder: `.thumbs/` (thumbnail cache, safe to
delete) and `.trash/`. Add both to `.gitignore` if the folder is a repo.

## Desktop app (Linux)

Requires Node, Rust, and WebKitGTK 4.1 (`webkit2gtk-4.1`).

```bash
npm ci
npm run desktop:install   # builds and copies the binary to ~/.local/bin/excalidraw-local
```

The drawings folder defaults to `~/Documents/excalidraw`; change it from the ⚙
button (saved in `~/.config/excalidraw-local/config.json`) or set
`DRAWINGS_ROOT`.

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
