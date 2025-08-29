"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  { ssr: false },
);

type InitialData = any;

function sanitizeForInitialData(data: any) {
  const out = { ...(data || {}) };
  out.appState = { ...(out.appState || {}) };

  const c = (out.appState as any).collaborators;
  // If collaborators isn’t a real Map, convert or drop it
  if (c && typeof (c as any).forEach !== "function") {
    if (Array.isArray(c)) {
      (out.appState as any).collaborators = new Map(c);
    } else if (typeof c === "object") {
      (out.appState as any).collaborators = new Map(Object.entries(c));
    } else {
      delete (out.appState as any).collaborators;
    }
  }
  // if it’s missing, you can also ensure it exists:
  if (!(out.appState as any).collaborators) {
    (out.appState as any).collaborators = new Map();
  }
  return out;
}

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

export default function ExcalidrawPad({ path }: { path: string }) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initial, setInitial] = useState<InitialData | null>(null);
  const [mounted, setMounted] = useState(false);

  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  // debounce timer for autosave (optional)
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await fetchJSON(path);
        setInitial(sanitizeForInitialData(data)); // <-- use sanitizer here
      } catch (e: any) {
        setError(e.message || "Failed to load");
      }
    })();
  }, [path]);

  const doSave = useCallback(async () => {
    if (!api) return;
    try {
      setStatus("saving");
      const scene =
        api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements?.();
      const rawAppState = api.getAppState?.();
      const { collaborators, ...appStateNoCollab } = rawAppState || {}; // drop it
      const files = api.getFiles?.();

      const payload = {
        type: "excalidraw",
        version: 2,
        elements: scene,
        appState: appStateNoCollab,
        files,
      };

      await saveJSON(path, payload);
      setStatus("saved");
    } catch (e: any) {
      setStatus("dirty");
      setError(String(e?.message || e));
    }
  }, [api, path]);

  // Optional: autosave after 1.5s of inactivity
  const onChange = useCallback(() => {
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), 10000);
  }, [doSave]);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          zIndex: 10,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <button onClick={doSave}>Save</button>
        {error && (
          <span style={{ color: "crimson", marginLeft: 8 }}>{error}</span>
        )}
        <span style={{ marginLeft: 12, opacity: 0.7 }}>
          Path: <code>{path}</code>
        </span>
      </div>

      {mounted && (
        <Excalidraw
          excalidrawAPI={(inst) => setApi(inst)}
          initialData={initial ?? undefined}
          onChange={onChange}
        />
      )}
    </div>
  );
}
