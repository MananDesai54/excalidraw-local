// Storage layer for drawings.
// - Desktop (Tauri): calls Rust commands that read/write the filesystem directly.
// - Web (Next.js server / Docker): the same operations through POST /api/fs.

export type Entry = { name: string; isDir: boolean; size: number; mtime: number };
export type DrawingInfo = {
  path: string;
  name: string;
  size: number;
  mtime: number;
  thumbMtime: number;
  text: string;
};

export const isDesktop = () =>
  typeof window !== "undefined" && !!(window as any).__TAURI__?.core?.invoke;

async function call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isDesktop()) {
    try {
      return await (window as any).__TAURI__.core.invoke(op, args);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  const res = await fetch("/api/fs", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, args }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).result as T;
}

export const getRoot = () => call<string>("get_root");

// Workspace (desktop only): which folder is open, like an editor.
export const getRecents = () => call<string[]>("get_recents");
export const forgetRecent = (path: string) => call<void>("forget_recent", { path });
/** Open `path` as the workspace, or show a folder picker. Null if cancelled. */
export const openFolder = (path?: string) => call<string | null>("open_folder", { path: path ?? null });
/** Pick any .excalidraw file; its folder becomes the workspace. Returns its client path. */
export const openFile = () => call<string | null>("open_file");
/** Save a drawing anywhere via a save dialog. Returns its new client path. */
export const saveAs = (name: string, data: unknown) => call<string | null>("save_as", { name, data });
/** File passed on the command line, once. */
export const takeLaunch = () => call<string | null>("take_launch");
export const listDir = (dir: string) => call<Entry[]>("list_dir", { dir });
export const scan = () => call<DrawingInfo[]>("scan");
/** Create a new file (fails if it exists); parent folders are created. */
export const createFile = (path: string, template?: unknown) =>
  call<void>("create_file", { path, template: template ?? null });
export const createDir = (path: string) => call<void>("create_dir", { path });
export const readDrawing = async (path: string) => ({
  data: await call<any>("read_drawing", { path }),
});
export const saveDrawing = async (path: string, data: unknown) => {
  await call<void>("save_drawing", { path, data });
  return { ok: true };
};
/** Write a sidecar file; returns its absolute path on disk. */
export const writeFile = (path: string, content: string, base64 = false) =>
  call<string>("write_file", { path, content, base64 });
export const readThumb = (path: string) => call<string | null>("read_thumb", { path });
export const writeThumb = (path: string, svg: string) => call<void>("write_thumb", { path, svg });
export const rename = (from: string, to: string) => call<void>("rename", { from, to });
export const trash = (path: string) => call<void>("trash", { path });

// path helpers
export const dirname = (p: string) => p.replace(/\/[^/]*$/, "") || "/";
export const basename = (p: string) => p.split("/").filter(Boolean).pop() || "";
export const joinPath = (a: string, b: string) =>
  (a.endsWith("/") ? a : a + "/") + b.replace(/^\/+/, "");
export const stripExt = (n: string) => n.replace(/\.excalidraw$/, "");
export const withExt = (n: string) => (n.endsWith(".excalidraw") ? n : `${n}.excalidraw`);
