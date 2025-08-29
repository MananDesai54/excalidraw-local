"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function Home() {
  const [path, setPath] = useState("/team/example.excalidraw");
  const [newName, setNewName] = useState("new-drawing.excalidraw");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createFile() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: newName.startsWith("/") ? newName : `/${newName}`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.href = `/drawpad?path=${encodeURIComponent(newName.startsWith("/") ? newName : `/${newName}`)}`;
    } catch (e: any) {
      setErr(e.message || "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(720px, 92vw)",
          background: "linear-gradient(180deg, #14161c, #0f1116)",
          border: "1px solid rgba(255,255,255,.06)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,.35)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28 }}>✏️ Drawpad</h1>
        <p style={{ marginTop: 8, color: "#c6c8ce" }}>
          Open an existing drawing by path, or create a fresh one.
        </p>

        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Open by path</span>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/team/example.excalidraw"
                className="ip"
              />
              <Link
                className="btn btn--primary"
                href={`/drawpad?path=${encodeURIComponent(path)}`}
              >
                Open
              </Link>
            </div>
          </label>

          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,.06)",
              margin: "6px 0",
            }}
          />

          <label style={{ display: "grid", gap: 6 }}>
            <span>Create new file</span>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="new-drawing.excalidraw"
                className="ip"
              />
              <button
                className="btn btn--primary"
                onClick={createFile}
                disabled={busy}
              >
                {busy ? <span className="spinner" /> : "Create"}
              </button>
            </div>
          </label>

          {err && (
            <div className="toast toast--error">
              <strong>Oops:</strong> {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <Link
              href="/files"
              className="btn"
              style={{
                borderColor: "rgba(255,255,255,.12)",
                color: "var(--muted)",
              }}
            >
              Browse files
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
