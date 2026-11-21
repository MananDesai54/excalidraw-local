"use client";

import React, { useEffect, useRef, useState } from "react";
import { forgetRecent, getRecents } from "@/lib/storage";

const tidy = (p: string) => p.replace(/^\/home\/[^/]+/, "~");
const name = (p: string) => p.split("/").filter(Boolean).pop() || p;

/** Folder switcher: open folder/file and recent folders (desktop). */
export default function WorkspaceMenu({
  root,
  onOpenFolder,
  onOpenFile,
}: {
  root: string;
  onOpenFolder: (path?: string) => void;
  onOpenFile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    getRecents().then(setRecents).catch(() => setRecents([]));
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="ws" ref={ref}>
      <button className="btn ws__btn" onClick={() => setOpen((o) => !o)} title={root}>
        📂 <span className="ws__name">{root ? name(root) : "…"}</span> ▾
      </button>
      {open && (
        <div className="ws__menu">
          <button className="ws__item" onClick={() => pick(() => onOpenFolder())}>
            Open folder… <kbd>Ctrl ⇧ O</kbd>
          </button>
          <button className="ws__item" onClick={() => pick(onOpenFile)}>
            Open file… <kbd>Ctrl O</kbd>
          </button>
          {recents.filter((r) => r !== root).length > 0 && <div className="ws__sep">Recent folders</div>}
          {recents
            .filter((r) => r !== root)
            .map((r) => (
              <div key={r} className="ws__recent">
                <button className="ws__item" onClick={() => pick(() => onOpenFolder(r))} title={r}>
                  <span>{name(r)}</span>
                  <small>{tidy(r)}</small>
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  title="Remove from list"
                  onClick={() => forgetRecent(r).then(() => setRecents((x) => x.filter((y) => y !== r)))}
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
