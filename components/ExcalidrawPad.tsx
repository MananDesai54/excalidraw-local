"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import FileBrowserModal from "@/components/FileBrowserModal";
import { useRouter } from "next/navigation";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  { ssr: false },
);

type InitialData = any;

async function fetchJSON(path: string) {
  const res = await fetch(`/api/drawing?path=${encodeURIComponent(path)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ data: InitialData }>;
}

async function saveJSON(path: string, data: any) {
  const res = await fetch(`/api/drawing?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

// Drop/repair collaborators so Excalidraw doesn't choke on non-Map values
function sanitizeForInitialData(data: any) {
  const out = { ...(data || {}) };
  out.appState = { ...(out.appState || {}) };
  const c = (out.appState as any).collaborators;
  if (c && typeof (c as any).forEach !== "function") {
    if (Array.isArray(c)) (out.appState as any).collaborators = new Map(c);
    else if (typeof c === "object")
      (out.appState as any).collaborators = new Map(Object.entries(c));
    else delete (out.appState as any).collaborators;
  }
  if (!(out.appState as any).collaborators)
    (out.appState as any).collaborators = new Map();
  return out;
}

export default function ExcalidrawPad({ path }: { path: string }) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initial, setInitial] = useState<InitialData | null>(null);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const [fbOpen, setFbOpen] = useState(false);

  const timer = useRef<NodeJS.Timeout | null>(null);

  // mount flag (avoid hydration flicker)
  useEffect(() => setMounted(true), []);

  // preload
  useEffect(() => {
    (async () => {
      try {
        const { data } = await fetchJSON(path);
        setInitial(sanitizeForInitialData(data));
      } catch (e: any) {
        setError(e.message || "Failed to load");
      }
    })();
  }, [path]);

  const doSave = useCallback(async () => {
    if (!api) return;
    try {
      setStatus("saving");
      const elements =
        api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements?.();
      const rawAppState = api.getAppState?.();
      const { collaborators, ...appState } = rawAppState || {}; // don't persist collaborators
      const files = api.getFiles?.();
      const payload = {
        type: "excalidraw",
        version: 2,
        elements,
        appState,
        files,
      };
      await saveJSON(path, payload);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1200);
    } catch (e: any) {
      setStatus("dirty");
      setError(String(e?.message || e));
    }
  }, [api, path]);

  // autosave after 1.2s idle
  const onChange = useCallback(() => {
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), 1200);
  }, [doSave]);

  // ⌘/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setFbOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // status text
  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "dirty"
          ? "Unsaved changes"
          : " ";

  return (
    <div className="page">
      <header className="topbar">
        <Link href="/" className="brand">
          ✏️ Drawpad
        </Link>
        <div className="spacer" />
        <span
          className={`pill ${
            status === "saved"
              ? "pill--ok"
              : status === "saving"
                ? "pill--busy"
                : status === "dirty"
                  ? "pill--warn"
                  : ""
          }`}
          aria-live="polite"
        >
          {status === "saving" && <span className="spinner" aria-hidden />}
          {statusLabel}
        </span>
        <button
          className="btn"
          onClick={() => setFbOpen(true)}
          title="Open (⌘/Ctrl+O)"
        >
          Open
        </button>

        <button
          className={`btn btn--primary ${status === "saving" ? "btn--loading" : ""}`}
          onClick={doSave}
          disabled={status === "saving"}
          title="Save (⌘/Ctrl+S)"
        >
          {status === "saving" ? <span className="spinner" /> : "Save"}
          <kbd className="keyhint">⌘S</kbd>
        </button>
      </header>

      {error && (
        <div className="toast toast--error">
          <strong>Save failed:</strong> {error}
        </div>
      )}

      <main className="canvas">
        {mounted && (
          <Excalidraw
            excalidrawAPI={(inst) => setApi(inst)}
            initialData={initial ?? undefined}
            onChange={onChange}
            theme="dark"
          />
        )}
      </main>
      <FileBrowserModal
        open={fbOpen}
        startDir={path.split("/").slice(0, -1).join("/") || "/"}
        onClose={() => setFbOpen(false)}
        onPick={(p) => {
          setFbOpen(false);
          // navigate to the picked file; the page will re-render with new ?path=
          router.push(`/drawpad?path=${encodeURIComponent(p)}`);
        }}
      />
    </div>
  );
}
