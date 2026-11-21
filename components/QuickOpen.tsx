"use client";

import React, { useEffect, useMemo, useState } from "react";
import { scan, type DrawingInfo, stripExt } from "@/lib/storage";
import { matches } from "@/lib/search";

/** Ctrl+P switcher: jump to any drawing by name, folder, or text inside it. */
export default function QuickOpen({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const [all, setAll] = useState<DrawingInfo[]>([]);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setIdx(0);
    scan()
      .then((d) => setAll(d.sort((a, b) => b.mtime - a.mtime)))
      .catch(() => setAll([]));
  }, [open]);

  const results = useMemo(() => all.filter((d) => matches(d, q)).slice(0, 50), [all, q]);

  if (!open) return null;
  const pick = (i: number) => results[i] && onPick(results[i].path);

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel modal__panel--wide">
        <input
          autoFocus
          className="ip"
          placeholder="Jump to drawing… (name, folder, or text inside)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") pick(idx);
          }}
        />
        <ul className="qo-list">
          {results.map((d, i) => (
            <li
              key={d.path}
              className={`qo-item ${i === idx ? "active" : ""}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => pick(i)}
            >
              <span>{stripExt(d.name)}</span>
              <small>{d.path}</small>
            </li>
          ))}
          {results.length === 0 && <li className="muted" style={{ padding: 10 }}>No matches</li>}
        </ul>
      </div>
    </div>
  );
}
