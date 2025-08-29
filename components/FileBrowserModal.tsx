"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";

type Entry = { name: string; isDir: boolean; size: number; mtime: string };

function joinPath(dir: string, name: string) {
  if (!dir.endsWith("/")) dir += "/";
  return (dir + name).replace(/\/+/g, "/");
}

export default function FileBrowserModal({
  open,
  startDir = "/",
  onClose,
  onPick,
}: {
  open: boolean;
  startDir?: string;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const [dir, setDir] = useState(startDir);
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("untitled.excalidraw");
  const [creating, setCreating] = useState(false);

  const fetchList = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Entry[];
      setItems(
        data.sort((a, b) =>
          a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
        ),
      );
      setSelected(null);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [dir, open]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && selected) onPick(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, onClose, onPick]);

  const crumbs = useMemo(() => {
    const parts = dir.split("/").filter(Boolean);
    const acc: { label: string; path: string }[] = [
      { label: "root", path: "/" },
    ];
    let p = "/";
    for (const seg of parts) {
      p = joinPath(p, seg);
      acc.push({ label: seg, path: p.endsWith("/") ? p : p + "/" });
    }
    return acc;
  }, [dir]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((it) => it.name.toLowerCase().includes(s));
  }, [items, q]);

  async function createFile() {
    setCreating(true);
    setError(null);
    try {
      const name = newName.endsWith(".excalidraw")
        ? newName
        : `${newName}.excalidraw`;
      const p = joinPath(dir, name);
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p.startsWith("/") ? p : `/${p}` }),
      });
      if (!res.ok) throw new Error(await res.text());
      onPick(p.startsWith("/") ? p : `/${p}`);
    } catch (e: any) {
      setError(e.message || "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal">
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Open drawing"
      >
        <div className="modal__header">
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <button
                key={c.path}
                className="crumb"
                onClick={() => setDir(c.path)}
                disabled={i === crumbs.length - 1}
              >
                {c.label}
                {i < crumbs.length - 1 ? " /" : ""}
              </button>
            ))}
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal__toolbar">
          <input
            className="ip"
            placeholder="Search files…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="grow" />
          <input
            className="ip"
            style={{ maxWidth: 260 }}
            placeholder="new-drawing.excalidraw"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="btn btn--primary"
            onClick={createFile}
            disabled={creating}
          >
            {creating ? <span className="spinner" /> : "Create"}
          </button>
        </div>

        <div className="modal__list">
          {loading && <div className="muted">Loading…</div>}
          {error && (
            <div className="toast toast--error">
              <strong>Oops:</strong> {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="muted">No items</div>
          )}

          <ul className="list">
            {filtered.map((it) => {
              const path = joinPath(dir, it.name);
              const isSelected = selected === path && !it.isDir;
              return (
                <li
                  key={path}
                  className={`row ${isSelected ? "row--selected" : ""}`}
                  onDoubleClick={() =>
                    it.isDir
                      ? setDir(path.endsWith("/") ? path : path + "/")
                      : onPick(path)
                  }
                  onClick={() => setSelected(it.isDir ? null : path)}
                >
                  <span className="cell cell--name">
                    <span className="badge">{it.isDir ? "📁" : "📄"}</span>
                    {it.name}
                  </span>
                  <span className="cell cell--meta">
                    {it.isDir ? "—" : `${it.size} B`}
                  </span>
                  <span className="cell cell--meta">
                    {new Date(it.mtime).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="modal__footer">
          <div className="muted">
            Enter ↵ to open • Esc to close • Double-click a folder/file
          </div>
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!selected}
            onClick={() => selected && onPick(selected)}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
