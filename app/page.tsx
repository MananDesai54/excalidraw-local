"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  basename,
  createDir,
  createFile,
  dirname,
  getRoot,
  isDesktop,
  joinPath,
  listDir,
  readDrawing,
  rename,
  scan,
  setRoot,
  stripExt,
  trash,
  withExt,
  type DrawingInfo,
  type Entry,
} from "@/lib/storage";
import { matches, snippet, timeAgo } from "@/lib/search";
import Thumb from "@/components/Thumb";
import QuickOpen from "@/components/QuickOpen";
import { DialogHost, confirm, prompt, useToast } from "@/components/Dialogs";

const drawUrl = (p: string) => `/drawpad?path=${encodeURIComponent(p)}`;
const dirUrl = (d: string) => (d === "/" ? "/" : `/?dir=${encodeURIComponent(d)}`);

function Library() {
  const router = useRouter();
  const sp = useSearchParams();
  const dir = sp?.get("dir") || "/";

  const [all, setAll] = useState<DrawingInfo[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [root, setRootPath] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [qoOpen, setQoOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const [a, e, r] = await Promise.all([scan(), listDir(dir).catch(() => []), getRoot()]);
      setAll(a);
      setEntries(e);
      setRootPath(r);
    } catch (err: any) {
      toast.show(err.message || String(err), true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = "Drawpad";
  }, []);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.show(ok);
    } catch (e: any) {
      toast.show(e?.message || String(e), true);
    }
    await refresh();
  };

  async function newDrawing() {
    const name = await prompt({ title: "New drawing", label: `In ${dir}`, value: "untitled.excalidraw", confirm: "Create" });
    if (!name) return;
    const p = name.startsWith("/") ? withExt(name) : joinPath(dir, withExt(name));
    try {
      await createFile(p, {
        type: "excalidraw",
        version: 2,
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      });
      router.push(drawUrl(p));
    } catch (e: any) {
      toast.show(e?.message || String(e), true);
    }
  }

  async function newFolder() {
    const name = await prompt({ title: "New folder", label: `In ${dir}`, value: "", confirm: "Create" });
    if (name) await run(() => createDir(joinPath(dir, name)));
  }

  async function renameItem(p: string, isDir: boolean) {
    const next = await prompt({
      title: isDir ? "Rename folder" : "Rename drawing",
      label: "Use a path like /other-folder/name to move it.",
      value: basename(p),
      confirm: "Rename",
    });
    if (!next || next === basename(p)) return;
    const target = next.startsWith("/") ? next : joinPath(dirname(p), next);
    await run(() => rename(p, isDir ? target : withExt(target)));
  }

  async function duplicate(p: string) {
    await run(async () => {
      const { data } = await readDrawing(p);
      const base = stripExt(p);
      for (let i = 1; i < 100; i++) {
        const target = `${base} copy${i > 1 ? ` ${i}` : ""}.excalidraw`;
        try {
          await createFile(target, data);
          return;
        } catch (e: any) {
          if (!/exist/i.test(e?.message || String(e))) throw e;
        }
      }
    }, "Duplicated");
  }

  async function remove(p: string, isDir: boolean) {
    if (await confirm(`Delete ${basename(p)}?`, `${isDir ? "The folder and everything in it" : "It"} will be moved to .trash in your drawings folder.`))
      await run(() => trash(p), "Moved to .trash");
  }

  async function changeRoot() {
    const next = await prompt({
      title: "Drawings folder",
      label: "Where drawings are stored. Point it at a docs folder or repo; subfolders show up here.",
      value: root,
      confirm: "Use folder",
    });
    if (!next || next === root) return;
    await run(() => setRoot(next), "Folder changed");
    router.push("/");
  }

  // Keyboard: / or Ctrl+F search, Ctrl+N new, Ctrl+P quick open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea");
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === "/" && !typing) || (mod && e.key.toLowerCase() === "f")) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void newDrawing();
      } else if (mod && (e.key.toLowerCase() === "p" || e.key.toLowerCase() === "o")) {
        e.preventDefault();
        setQoOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const folders = useMemo(
    () => entries.filter((e) => e.isDir).sort((a, b) => a.name.localeCompare(b.name)),
    [entries],
  );
  const here = useMemo(
    () => all.filter((d) => dirname(d.path) === (dir.replace(/\/+$/, "") || "/")).sort((a, b) => b.mtime - a.mtime),
    [all, dir],
  );
  const recent = useMemo(() => [...all].sort((a, b) => b.mtime - a.mtime).slice(0, 6), [all]);
  const results = useMemo(
    () => (q.trim() ? all.filter((d) => matches(d, q)).sort((a, b) => b.mtime - a.mtime) : []),
    [all, q],
  );

  const crumbs = useMemo(() => {
    const parts = dir.split("/").filter(Boolean);
    return [{ label: "All drawings", path: "/" }].concat(
      parts.map((p, i) => ({ label: p, path: "/" + parts.slice(0, i + 1).join("/") })),
    );
  }, [dir]);

  const card = (d: DrawingInfo, showFolder = false) => {
    const snip = q.trim() ? snippet(d.text, q) : null;
    return (
      <div key={d.path} className="card" onClick={() => router.push(drawUrl(d.path))} title={d.path}>
        <Thumb info={d} />
        <div className="card__body">
          <div className="card__name">{stripExt(d.name)}</div>
          {snip ? (
            <div className="card__snippet">
              {snip.before}
              <mark>{snip.hit}</mark>
              {snip.after}
            </div>
          ) : (
            <div className="card__meta">
              {showFolder && dirname(d.path) !== "/" ? `${dirname(d.path)} · ` : ""}
              {timeAgo(d.mtime)}
            </div>
          )}
        </div>
        <div className="card__menu" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn--sm" onClick={() => renameItem(d.path, false)}>Rename</button>
          <button className="btn btn--sm" onClick={() => duplicate(d.path)}>Duplicate</button>
          <button className="btn btn--sm btn--danger" onClick={() => remove(d.path, false)}>Delete</button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="brand" onClick={() => { setQ(""); router.push("/"); }}>
          ✏️ Drawpad
        </button>
        <input
          ref={searchRef}
          className="ip"
          style={{ maxWidth: 480 }}
          placeholder="Search names and text inside drawings…  ( / )"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
            if (e.key === "Enter" && results[0]) router.push(drawUrl(results[0].path));
          }}
        />
        <div className="spacer" />
        <button className="btn" onClick={() => setQoOpen(true)} title="Quick open (Ctrl+P)">
          Jump to… <kbd>Ctrl P</kbd>
        </button>
        <button className="btn" onClick={newFolder}>New folder</button>
        <button className="btn btn--primary" onClick={newDrawing} title="Ctrl+N">
          New drawing
        </button>
        {isDesktop() && (
          <button className="btn btn--ghost" onClick={changeRoot} title="Drawings folder">
            ⚙
          </button>
        )}
      </header>

      <main className="lib">
        {q.trim() ? (
          <>
            <div className="section-title">
              {results.length} result{results.length === 1 ? "" : "s"} for “{q.trim()}”
            </div>
            {results.length ? (
              <div className="grid">{results.map((d) => card(d, true))}</div>
            ) : (
              <div className="empty">Nothing matches. Search looks at file names, folders, and text inside drawings.</div>
            )}
          </>
        ) : (
          <>
            <div className="lib-head">
              <nav className="crumbs">
                {crumbs.map((c, i) => (
                  <React.Fragment key={c.path}>
                    {i > 0 && <span className="muted">/</span>}
                    <button className="crumb" onClick={() => router.push(dirUrl(c.path))}>{c.label}</button>
                  </React.Fragment>
                ))}
              </nav>
              <div className="spacer" />
              {root && <span className="lib-root" title="Drawings folder">{root}</span>}
            </div>

            {dir === "/" && recent.length > 3 && (
              <>
                <div className="section-title">Recently edited</div>
                <div className="grid">{recent.map((d) => card(d, true))}</div>
              </>
            )}

            {folders.length > 0 && (
              <>
                <div className="section-title">Folders</div>
                <div className="folders">
                  {folders.map((f) => {
                    const p = joinPath(dir, f.name);
                    const count = all.filter((d) => d.path.startsWith(p + "/")).length;
                    return (
                      <div key={f.name} className="folder" onClick={() => router.push(dirUrl(p))}>
                        📁 {f.name} <span className="muted">{count}</span>
                        <span className="card__menu" onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn--sm" onClick={() => renameItem(p, true)}>Rename</button>
                          <button className="btn btn--sm btn--danger" onClick={() => remove(p, true)}>Delete</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="section-title">{dir === "/" ? "Drawings" : `Drawings in ${basename(dir)}`}</div>
            {here.length ? (
              <div className="grid">{here.map((d) => card(d))}</div>
            ) : (
              !loading && (
                <div className="empty">
                  No drawings here yet. <button className="btn btn--sm btn--primary" onClick={newDrawing}>New drawing</button>
                </div>
              )
            )}
          </>
        )}
      </main>

      <QuickOpen open={qoOpen} onClose={() => setQoOpen(false)} onPick={(p) => router.push(drawUrl(p))} />
      <DialogHost />
      {toast.node}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Library />
    </Suspense>
  );
}
