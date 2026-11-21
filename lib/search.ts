import type { DrawingInfo } from "./storage";

const terms = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/** Every search term must appear in the path or in the drawing's text. */
export function matches(d: DrawingInfo, q: string) {
  const t = terms(q);
  if (!t.length) return true;
  const hay = `${d.path}\n${d.text}`.toLowerCase();
  return t.every((x) => hay.includes(x));
}

/** A short excerpt of the drawing text around the first matching term. */
export function snippet(text: string, q: string): { before: string; hit: string; after: string } | null {
  const lower = text.toLowerCase();
  for (const x of terms(q)) {
    const i = lower.indexOf(x);
    if (i >= 0) {
      return {
        before: (i > 30 ? "…" : "") + text.slice(Math.max(0, i - 30), i),
        hit: text.slice(i, i + x.length),
        after: text.slice(i + x.length, i + x.length + 60),
      };
    }
  }
  return null;
}

export function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ms).toLocaleDateString();
}
