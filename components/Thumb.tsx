"use client";

import React, { useEffect, useState } from "react";
import { readDrawing, readThumb, writeThumb, type DrawingInfo } from "@/lib/storage";
import { sceneToSvg } from "@/lib/excalidraw";

// Generate missing/stale thumbnails one at a time so the library stays responsive.
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T,>(fn: () => Promise<T>) => {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
};

async function loadThumb(d: DrawingInfo): Promise<string | null> {
  if (d.thumbMtime >= d.mtime) {
    const svg = await readThumb(d.path);
    if (svg) return svg;
  }
  return enqueue(async () => {
    const { data } = await readDrawing(d.path);
    if (!data?.elements?.some((e: any) => !e.isDeleted)) return null;
    const svg = await sceneToSvg(data, { padding: 10 });
    writeThumb(d.path, svg).catch(() => {});
    return svg;
  });
}

export default function Thumb({ info }: { info: DrawingInfo }) {
  const [svg, setSvg] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadThumb(info)
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [info.path, info.mtime, info.thumbMtime]);

  if (svg === undefined) return <div className="thumb thumb--empty" />;
  if (svg === null) return <div className="thumb thumb--empty">Empty</div>;
  // Our own export of our own file; inline so the hand-drawn fonts apply.
  return <div className="thumb" dangerouslySetInnerHTML={{ __html: svg }} />;
}
