"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Entry = { name: string; isDir: boolean; size: number; mtime: string };

export default function FilesPage({ searchParams }: any) {
  const dir = (searchParams?.dir as string) || "/";
  const [items, setItems] = useState<Entry[]>([]);
  const [newName, setNewName] = useState("new.excalidraw");
  useEffect(() => {
    fetch(`/api/files?dir=${encodeURIComponent(dir)}`)
      .then((r) => r.json())
      .then(setItems);
  }, [dir]);

  const create = async () => {
    const p = dir.endsWith("/") ? dir + newName : dir + "/" + newName;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p }),
    });
    if (res.ok) location.reload();
    else alert(await res.text());
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <h2>
        Files in <code>{dir}</code>
      </h2>
      <div style={{ margin: "12px 0" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="name.excalidraw"
        />
        <button onClick={create} style={{ marginLeft: 8 }}>
          Create
        </button>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.name} style={{ margin: "6px 0" }}>
            {it.isDir ? "📁" : "📄"}{" "}
            {it.isDir ? (
              <Link
                href={`/files?dir=${encodeURIComponent((dir.endsWith("/") ? dir : dir + "/") + it.name)}`}
              >
                {it.name}/
              </Link>
            ) : (
              <>
                <span>{it.name}</span>{" "}
                <Link
                  href={`/drawpad?path=${encodeURIComponent((dir.endsWith("/") ? dir : dir + "/") + it.name)}`}
                >
                  open in drawpad ↗
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 24 }}>
        <Link
          href={`/files?dir=${encodeURIComponent(dir.split("/").slice(0, -2).join("/") || "/")}`}
        >
          ⬅ up
        </Link>
      </div>
    </div>
  );
}
