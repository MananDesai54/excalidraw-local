// Excalidraw helpers: local asset path (offline fonts) and export utilities.
const LOCAL_ASSETS = "/";
// SVG export appends "/dist/excalidraw-assets/" to this, so give the package root.
const PUBLIC_ASSETS = "https://unpkg.com/@excalidraw/excalidraw@0.17.6";

if (typeof window !== "undefined") {
  // Fonts/locales are copied into public/excalidraw-assets at build time.
  (window as any).EXCALIDRAW_ASSET_PATH = LOCAL_ASSETS;
}

export type Scene = { elements: readonly any[]; appState?: any; files?: any };

const lib = () => import("@excalidraw/excalidraw");

function live(scene: Scene) {
  const elements = (scene.elements || []).filter((e: any) => !e.isDeleted);
  const { collaborators, ...appState } = scene.appState || {};
  return { elements, appState, files: scene.files || {} };
}

/**
 * SVG markup.
 * - `portable`: font URLs point at the public CDN so the file renders anywhere (docs, GitHub).
 * - otherwise font rules are dropped; the app's own CSS provides the fonts (thumbnails).
 */
export async function sceneToSvg(scene: Scene, opts: { portable?: boolean; padding?: number } = {}) {
  const { exportToSvg } = await lib();
  const s = live(scene);
  const w = window as any;
  const prev = w.EXCALIDRAW_ASSET_PATH;
  if (opts.portable) w.EXCALIDRAW_ASSET_PATH = PUBLIC_ASSETS;
  try {
    const svg = await exportToSvg({
      elements: s.elements as any,
      appState: { ...s.appState, exportBackground: true },
      files: s.files,
      exportPadding: opts.padding ?? 16,
    });
    if (!opts.portable) svg.querySelectorAll("style").forEach((st) => {
      if (st.textContent?.includes("@font-face")) st.remove();
    });
    return svg.outerHTML;
  } finally {
    w.EXCALIDRAW_ASSET_PATH = prev;
  }
}

/** PNG as base64 (no data: prefix), rendered at 2x. */
export async function sceneToPngBase64(scene: Scene) {
  const { exportToBlob } = await lib();
  const s = live(scene);
  const blob = await exportToBlob({
    elements: s.elements as any,
    appState: { ...s.appState, exportBackground: true, exportScale: 2 },
    files: s.files,
    mimeType: "image/png",
    exportPadding: 16,
  });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
