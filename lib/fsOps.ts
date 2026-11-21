// Server-side (Node) implementation of the storage operations, used by the
// web build through /api/fs. Mirrors the Tauri commands in src-tauri/src/main.rs.
import fs from "fs/promises";
import path from "path";

const THUMBS = ".thumbs";
const TRASH = ".trash";

export const root = () => path.resolve(process.env.DRAWINGS_ROOT || "/srv/excalidraw/drawings");

function safeResolve(p: string) {
  const base = root();
  const full = path.resolve(base, "." + (p.startsWith("/") ? p : "/" + p));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Invalid path");
  return full;
}
const thumbPath = (p: string) => safeResolve(`/${THUMBS}/${p.replace(/^\/+/, "")}.svg`);

const BLANK = { type: "excalidraw", version: 2, elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };

async function exists(p: string) {
  return fs.access(p).then(() => true, () => false);
}

async function writeBytes(full: string, data: string | Buffer, createNew = false) {
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data, { flag: createNew ? "wx" : "w" });
}

function drawingText(v: any): string {
  const parts: string[] = [];
  for (const el of v?.elements ?? []) {
    if (el?.isDeleted) continue;
    const t = el?.type === "text" ? el.text ?? el.originalText : el?.type === "frame" || el?.type === "magicframe" ? el.name : null;
    if (typeof t === "string" && t.trim()) parts.push(t.replace(/\n/g, " "));
  }
  return parts.join(" · ").slice(0, 4000);
}

async function mtimeOf(p: string) {
  try {
    return (await fs.stat(p)).mtimeMs;
  } catch {
    return 0;
  }
}

export const ops: Record<string, (a: any) => Promise<any>> = {
  async get_root() {
    return root();
  },
  async set_root() {
    throw new Error("Set DRAWINGS_ROOT on the server to change the folder");
  },
  async list_dir({ dir }) {
    await fs.mkdir(root(), { recursive: true });
    const full = safeResolve(dir || "/");
    const entries = await fs.readdir(full, { withFileTypes: true });
    return Promise.all(
      entries
        .filter((e) => !e.name.startsWith("."))
        .map(async (e) => {
          const st = await fs.stat(path.join(full, e.name));
          return { name: e.name, isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
        }),
    );
  },
  async scan() {
    const base = root();
    await fs.mkdir(base, { recursive: true });
    const out: any[] = [];
    const walk = async (dir: string) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith(".excalidraw")) {
          const st = await fs.stat(p);
          const rel = "/" + path.relative(base, p).split(path.sep).join("/");
          let text = "";
          try {
            text = drawingText(JSON.parse(await fs.readFile(p, "utf8")));
          } catch {}
          out.push({ path: rel, name: e.name, size: st.size, mtime: st.mtimeMs, thumbMtime: await mtimeOf(thumbPath(rel)), text });
        }
      }
    };
    await walk(base);
    return out;
  },
  async create_file({ path: p, template }) {
    await writeBytes(safeResolve(p), JSON.stringify(template ?? { type: "excalidraw", version: 2, elements: [], appState: {}, files: {} }, null, 2), true);
  },
  async create_dir({ path: p }) {
    await fs.mkdir(safeResolve(p), { recursive: true });
  },
  async read_drawing({ path: p }) {
    try {
      return JSON.parse(await fs.readFile(safeResolve(p), "utf8"));
    } catch (e: any) {
      if (e?.message === "Invalid path") throw e;
      return BLANK;
    }
  },
  async save_drawing({ path: p, data }) {
    await writeBytes(safeResolve(p), JSON.stringify(data ?? BLANK, null, 2));
  },
  async write_file({ path: p, content, base64 }) {
    const full = safeResolve(p);
    await writeBytes(full, base64 ? Buffer.from(content, "base64") : content);
    return full;
  },
  async read_thumb({ path: p }) {
    return fs.readFile(thumbPath(p), "utf8").catch(() => null);
  },
  async write_thumb({ path: p, svg }) {
    await writeBytes(thumbPath(p), svg);
  },
  async rename({ from, to }) {
    const src = safeResolve(from);
    const dst = safeResolve(to);
    if (src === root()) throw new Error("Cannot rename the root folder");
    if (await exists(dst)) throw new Error(`${to} already exists`);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    const isDir = (await fs.stat(dst)).isDirectory();
    const ts = isDir ? safeResolve(`/${THUMBS}${from}`) : thumbPath(from);
    const td = isDir ? safeResolve(`/${THUMBS}${to}`) : thumbPath(to);
    if (await exists(ts)) {
      await fs.mkdir(path.dirname(td), { recursive: true });
      await fs.rename(ts, td).catch(() => {});
    }
  },
  async trash({ path: p }) {
    const src = safeResolve(p);
    if (src === root()) throw new Error("Cannot delete the root folder");
    const dst = path.join(root(), TRASH, `${Math.floor(Date.now() / 1000)}-${path.basename(src)}`);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    await fs.rm(thumbPath(p), { force: true });
  },
};
