import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.env.DRAWINGS_ROOT || '/srv/excalidraw/drawings';

function safeResolve(p: string) {
  const base = path.resolve(ROOT);
  const full = path.resolve(base, '.' + p);
  if (!full.startsWith(base)) throw new Error('Invalid path');
  return full;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const dir = String(req.query.dir || '/');
      const full = safeResolve(dir);
      const entries = await fs.readdir(full, { withFileTypes: true });
      const out = await Promise.all(entries.map(async e => {
        const f = path.join(full, e.name);
        const st = await fs.stat(f);
        return { name: e.name, isDir: e.isDirectory(), size: st.size, mtime: st.mtime };
      }));
      res.status(200).json(out);
      return;
    }

    if (req.method === 'POST') {
      const { path: p, template } = req.body || {};
      if (!p || typeof p !== 'string') return res.status(400).send('path required');
      const full = safeResolve(p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      const content = Buffer.from(JSON.stringify(template ?? {
        type: 'excalidraw', version: 2, elements: [], appState: {}, files: {}
      }, null, 2), 'utf8');
      await fs.writeFile(full, content, { flag: 'wx' }); // fail if exists
      res.status(201).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).end('Method Not Allowed');
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
}
