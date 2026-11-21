"use client";
import "@/lib/excalidraw"; // must run before Excalidraw loads (local font path)

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import {
  basename,
  dirname,
  readDrawing,
  rename,
  saveDrawing,
  stripExt,
  withExt,
  joinPath,
  writeFile,
  writeThumb,
  isDesktop,
  openFile,
  saveAs,
} from "@/lib/storage";
import { sceneToPngBase64, sceneToSvg, type Scene } from "@/lib/excalidraw";
import QuickOpen from "@/components/QuickOpen";
import { DialogHost, prompt, useToast } from "@/components/Dialogs";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  { ssr: false },
);

type SyncExport = { svg?: boolean; png?: boolean };

// Drop/repair collaborators so Excalidraw doesn't choke on non-Map values
function sanitizeForInitialData(data: any) {
  const out = { ...(data || {}) };
  out.appState = { ...(out.appState || {}) };
  delete out.appState.collaborators;
  out.appState.collaborators = new Map();
  if (!out.appState.theme) out.appState.theme = "dark";
  return out;
}

/** Changes only when something worth saving changed (not on selection/scroll). */
function signature(elements: readonly any[], appState: any, files: any) {
  let v = 0;
  for (const e of elements) v += e.version;
  return `${elements.length}:${v}:${appState?.viewBackgroundColor}:${appState?.theme}:${Object.keys(files || {}).length}`;
}

const drawUrl = (p: string) => `/drawpad?path=${encodeURIComponent(p)}`;

export default function ExcalidrawPad({ path }: { path: string }) {
  const router = useRouter();
  const toast = useToast();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initial, setInitial] = useState<any | null>(null);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [sync, setSync] = useState<SyncExport>({});
  const [qoOpen, setQoOpen] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);
  const loadedAt = useRef(0);
  const dirty = useRef(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const syncRef = useRef<SyncExport>({});
  apiRef.current = api;
  syncRef.current = sync;

  const name = stripExt(basename(path));

  useEffect(() => {
    document.title = `${name} · Drawpad`;
  }, [name]);

  // load
  useEffect(() => {
    let alive = true;
    setInitial(null);
    lastSig.current = null;
    readDrawing(path)
      .then(({ data }) => {
        if (!alive) return;
        setSync(data?.localExport || {});
        loadedAt.current = Date.now();
        setInitial(sanitizeForInitialData(data));
      })
      .catch((e) => toast.show(`Could not open: ${e.message || e}`, true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const currentScene = (): Scene | null => {
    const a = apiRef.current;
    if (!a) return null;
    return {
      elements: a.getSceneElementsIncludingDeleted(),
      appState: a.getAppState(),
      files: a.getFiles(),
    };
  };

  /** Write SVG/PNG next to the drawing. Returns the written paths. */
  const exportSidecars = useCallback(
    async (kinds: SyncExport, scene: Scene) => {
      const base = stripExt(path);
      const written: string[] = [];
      if (kinds.svg) written.push(await writeFile(`${base}.svg`, await sceneToSvg(scene, { portable: true })));
      if (kinds.png) written.push(await writeFile(`${base}.png`, await sceneToPngBase64(scene), true));
      return written;
    },
    [path],
  );

  const toPayload = (scene: Scene) => {
    const { collaborators, ...appState } = (scene.appState || {}) as any;
    const payload: any = {
      type: "excalidraw",
      version: 2,
      source: "excalidraw-local",
      elements: scene.elements,
      appState,
      files: scene.files,
    };
    if (syncRef.current.svg || syncRef.current.png) payload.localExport = syncRef.current;
    return payload;
  };

  const doSave = useCallback(async () => {
    const scene = currentScene();
    if (!scene) return;
    if (timer.current) clearTimeout(timer.current);
    try {
      setStatus("saving");
      await saveDrawing(path, toPayload(scene));
      dirty.current = false;
      setStatus("saved");
      // Thumbnail + synced exports are best effort and never block saving.
      sceneToSvg(scene, { padding: 10 })
        .then((svg) => writeThumb(path, svg))
        .catch(() => {});
      exportSidecars(syncRef.current, scene).catch((e) => toast.show(`Export failed: ${e.message || e}`, true));
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch (e: any) {
      setStatus("dirty");
      toast.show(`Save failed: ${e?.message || e}`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, exportSidecars]);

  // Autosave 800ms after the drawing (not the selection/viewport) changes.
  const onChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      const sig = signature(elements, appState, files);
      // Right after load Excalidraw normalises the scene and re-measures text
      // once fonts arrive; treat that as the baseline, not as an edit.
      if (lastSig.current === null || Date.now() - loadedAt.current < 1500) {
        lastSig.current = sig;
        return;
      }
      if (sig === lastSig.current) return;
      lastSig.current = sig;
      dirty.current = true;
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void doSave(), 800);
    },
    [doSave],
  );

  // Never lose edits when leaving the page.
  useEffect(
    () => () => {
      if (dirty.current) void doSave();
    },
    [doSave],
  );

  const leaveTo = async (url: string) => {
    if (dirty.current) await doSave();
    router.push(url);
  };

  async function renameDrawing() {
    const next = await prompt({
      title: "Rename drawing",
      label: "Use a path like /other-folder/name to move it.",
      value: basename(path),
      confirm: "Rename",
    });
    if (!next || next === basename(path)) return;
    const target = withExt(next.startsWith("/") ? next : joinPath(dirname(path), next));
    try {
      if (dirty.current) await doSave();
      await rename(path, target);
      router.replace(drawUrl(target));
    } catch (e: any) {
      toast.show(e?.message || String(e), true);
    }
  }

  /** Save a copy anywhere and continue editing that copy (its folder becomes the open folder). */
  async function saveCopyAs() {
    const scene = currentScene();
    if (!scene) return;
    try {
      const target = await saveAs(basename(path), toPayload(scene));
      if (!target) return;
      // The open folder changed; nothing pending may be written to the old relative path.
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      router.replace(drawUrl(target));
    } catch (e: any) {
      toast.show(`Save as failed: ${e?.message || e}`, true);
    }
  }

  async function openOther() {
    try {
      if (dirty.current) await doSave();
      const p = await openFile();
      if (!p) return;
      dirty.current = false;
      router.push(drawUrl(p));
    } catch (e: any) {
      toast.show(e?.message || String(e), true);
    }
  }

  async function toggleSync(kind: "svg" | "png") {
    const next = { ...sync, [kind]: !sync[kind] };
    setSync(next);
    syncRef.current = next;
    const scene = currentScene();
    if (!scene) return;
    try {
      // Persist the preference in the drawing file and export right away.
      dirty.current = true;
      await doSave();
      if (next[kind]) {
        const [file] = await exportSidecars({ [kind]: true }, scene);
        const md = `![${name}](./${basename(file)})`;
        toast.show(
          <>
            <span>
              {kind.toUpperCase()} kept in sync at <b>{file}</b>
            </span>
            <button
              className="btn btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard?.writeText(md).then(
                  () => toast.show("Markdown copied"),
                  () => toast.show(md, false, 8000),
                );
              }}
            >
              Copy markdown
            </button>
          </>,
          false,
          8000,
        );
      }
    } catch (e: any) {
      toast.show(`Export failed: ${e?.message || e}`, true);
    }
  }

  // Shortcuts. Capture phase so Excalidraw's own Ctrl+S/O (browser file
  // dialogs) don't fire.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.shiftKey) {
        if (k === "s" && isDesktop()) {
          e.preventDefault();
          e.stopPropagation();
          void saveCopyAs();
        }
        return;
      }
      if (k === "o" && isDesktop()) {
        e.preventDefault();
        e.stopPropagation();
        void openOther();
      } else if (k === "s") {
        e.preventDefault();
        e.stopPropagation();
        void doSave();
      } else if (k === "o" || k === "p") {
        e.preventDefault();
        e.stopPropagation();
        setQoOpen(true);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doSave, path]);

  const statusLabel =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "dirty" ? "Unsaved" : "All changes saved";
  const pillClass =
    status === "saved" ? "pill--ok" : status === "saving" ? "pill--busy" : status === "dirty" ? "pill--warn" : "";
  const folder = dirname(path);

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn btn--ghost" onClick={() => leaveTo(folder === "/" ? "/" : `/?dir=${encodeURIComponent(folder)}`)} title="Back to library">
          ← Library
        </button>
        <div className="doc-title" onClick={renameDrawing} title="Click to rename" style={{ cursor: "pointer" }}>
          <strong>{name}</strong>
          <span>{folder}</span>
        </div>
        <span className={`pill ${pillClass}`} aria-live="polite">
          {status === "saving" && <span className="spinner" aria-hidden />}
          {statusLabel}
        </span>
        <div className="spacer" />
        <div className="toggle" title="Keep an image next to the drawing, updated on every save, for embedding in docs">
          <span className="toggle__label">Export</span>
          <button className={`btn ${sync.svg ? "on" : ""}`} onClick={() => toggleSync("svg")}>
            SVG
          </button>
          <button className={`btn ${sync.png ? "on" : ""}`} onClick={() => toggleSync("png")}>
            PNG
          </button>
        </div>
        <button className="btn" onClick={() => setQoOpen(true)} title="Jump to another drawing in this folder">
          Jump to <kbd>Ctrl P</kbd>
        </button>
        {isDesktop() && (
          <button className="btn" onClick={saveCopyAs} title="Save a copy anywhere (Ctrl+Shift+S)">
            Save as…
          </button>
        )}
        <button className="btn btn--primary" onClick={() => void doSave()} disabled={status === "saving"}>
          Save <kbd>Ctrl S</kbd>
        </button>
      </header>

      <main className="canvas">
        {initial && (
          <Excalidraw
            key={path}
            excalidrawAPI={(inst) => {
              loadedAt.current = Date.now();
              setApi(inst);
            }}
            initialData={initial}
            onChange={onChange}
            name={name}
            UIOptions={{ canvasActions: { loadScene: false } }}
          />
        )}
      </main>

      <QuickOpen open={qoOpen} onClose={() => setQoOpen(false)} onPick={(p) => { setQoOpen(false); void leaveTo(drawUrl(p)); }} />
      <DialogHost />
      {toast.node}
    </div>
  );
}
