import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import path from "path";

const ROOT = process.env.DRAWINGS_ROOT || "/srv/excalidraw/drawings";

// Prevent directory traversal; keep all reads/writes under ROOT
function safeResolve(p: string) {
  const base = path.resolve(ROOT);
  const full = path.resolve(base, "." + p);
  if (!full.startsWith(base)) throw new Error("Invalid path");
  return full;
}

const BLANK = {
  type: "excalidraw",
  version: 2,
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const raw = String(req.query.path || "");
    if (!raw || !raw.startsWith("/")) {
      return res
        .status(400)
        .send("path must be absolute like /team/foo.excalidraw");
    }

    if (req.method === "GET") {
      let buf: Buffer;
      try {
        buf = await fs.readFile(safeResolve(raw));
      } catch {
        buf = Buffer.from(JSON.stringify(BLANK, null, 2), "utf8");
      }
      return res.status(200).json({ data: JSON.parse(buf.toString("utf8")) });
    }

    if (req.method === "PUT") {
      const full = safeResolve(raw);
      await fs.mkdir(path.dirname(full), { recursive: true });
      const content = Buffer.from(
        JSON.stringify(req.body ?? BLANK, null, 2),
        "utf8",
      );
      await fs.writeFile(full, content);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    return res.status(500).send(e?.message || "Server error");
  }
}
