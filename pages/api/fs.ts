import type { NextApiRequest, NextApiResponse } from "next";
import { ops } from "@/lib/fsOps";

export const config = { api: { bodyParser: { sizeLimit: "50mb" } } };

// POST { op, args } → same operations as the desktop app's Tauri commands.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }
  const { op, args } = req.body || {};
  const fn = ops[op];
  if (!fn) return res.status(400).send(`Unknown op: ${op}`);
  try {
    const result = await fn(args || {});
    return res.status(200).json({ result: result ?? null });
  } catch (e: any) {
    return res.status(500).send(e?.message || "Server error");
  }
}
