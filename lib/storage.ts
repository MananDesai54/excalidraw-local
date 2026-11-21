// Storage layer for drawings.
// - Desktop (Tauri): calls Rust commands that read/write the filesystem directly.
// - Web (Next.js server / Docker): falls back to the /api routes.

export type Entry = { name: string; isDir: boolean; size: number; mtime: string | number };

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function tauriInvoke(): Invoke | null {
  if (typeof window === "undefined") return null;
  const t = (window as any).__TAURI__;
  return t?.core?.invoke ?? null;
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function errMsg(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export async function listDir(dir: string): Promise<Entry[]> {
  const invoke = tauriInvoke();
  if (invoke) return invoke<Entry[]>("list_dir", { dir }).catch((e) => { throw errMsg(e); });
  return http<Entry[]>(`/api/files?dir=${encodeURIComponent(dir)}`);
}

/** Create a new file (fails if it exists); parent folders are created. */
export async function createFile(path: string, template?: unknown): Promise<void> {
  const invoke = tauriInvoke();
  if (invoke) {
    await invoke("create_file", { path, template: template ?? null }).catch((e) => { throw errMsg(e); });
    return;
  }
  await http(`/api/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, template }),
  });
}

export async function readDrawing(path: string): Promise<{ data: any }> {
  const invoke = tauriInvoke();
  if (invoke) {
    const data = await invoke<any>("read_drawing", { path }).catch((e) => { throw errMsg(e); });
    return { data };
  }
  return http(`/api/drawing?path=${encodeURIComponent(path)}`);
}

export async function saveDrawing(path: string, data: unknown): Promise<{ ok: boolean }> {
  const invoke = tauriInvoke();
  if (invoke) {
    await invoke("save_drawing", { path, data }).catch((e) => { throw errMsg(e); });
    return { ok: true };
  }
  return http(`/api/drawing?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
