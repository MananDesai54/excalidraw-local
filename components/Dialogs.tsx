"use client";

import React, { useEffect, useRef, useState } from "react";

type PromptOpts = {
  title: string;
  label?: string;
  value?: string;
  confirm?: string;
  danger?: boolean;
  /** No input, just confirm/cancel. */
  noInput?: boolean;
};

type Pending = PromptOpts & { resolve: (v: string | null) => void };

let open: ((p: Pending) => void) | null = null;

/** Ask for a value. Resolves null on cancel. Requires <DialogHost/> mounted. */
export function prompt(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    if (!open) return resolve(null);
    open({ ...opts, resolve });
  });
}

export async function confirm(title: string, label?: string, confirmText = "Delete") {
  return (await prompt({ title, label, noInput: true, confirm: confirmText, danger: true })) !== null;
}

export function DialogHost() {
  const [p, setP] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    open = (next) => {
      setP(next);
      setValue(next.value ?? "");
    };
    return () => {
      open = null;
    };
  }, []);

  useEffect(() => {
    if (!p || p.noInput) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Select the name without the extension
    const dot = el.value.lastIndexOf(".excalidraw");
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, [p]);

  if (!p) return null;
  const done = (v: string | null) => {
    p.resolve(v);
    setP(null);
  };

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form
        className="modal__panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (p.noInput) return done("");
          if (value.trim()) done(value.trim());
        }}
        onKeyDown={(e) => e.key === "Escape" && done(null)}
      >
        <h3>{p.title}</h3>
        {p.label && <div className="muted">{p.label}</div>}
        {!p.noInput && (
          <input ref={ref} className="ip" value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <div className="modal__actions">
          <button type="button" className="btn" onClick={() => done(null)}>
            Cancel
          </button>
          <button
            type="submit"
            autoFocus={p.noInput}
            className={`btn ${p.danger ? "btn--danger" : "btn--primary"}`}
          >
            {p.confirm ?? "OK"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Small transient message. */
export function useToast() {
  const [toast, setToast] = useState<{ msg: React.ReactNode; error?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (msg: React.ReactNode, error = false, ms = error ? 6000 : 3500) => {
    setToast({ msg, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  };
  const node = toast ? (
    <div className={`toast ${toast.error ? "toast--error" : ""}`} onClick={() => setToast(null)}>
      {toast.msg}
    </div>
  ) : null;
  return { show, node };
}
