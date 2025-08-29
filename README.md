# excalidraw-local

A Wrapper app around excalidraw that allows you to save file locally and load them easily with intuitive Ui

# Next.js Excalidraw (server-backed)

A tiny Next.js app that embeds the Excalidraw editor and saves drawings directly
to a server directory via API routes (with ETag checks).

## How it works

- UI at `/drawpad?path=/team/diagram.excalidraw`
- `GET /api/drawing?path=...` reads JSON (or returns a blank template if not found)
- `PUT /api/drawing?path=...` writes JSON; uses `If-Match` to prevent overwrites
- `GET /api/files?dir=/team` lists files/folders
- Optional: `POST /api/files` to create an empty file

## Quick start (locally)

```bash
cp .env.example .env
npm i
npm run dev
# open http://localhost:3000/drawpad?path=/demo/foo.excalidraw
```

## Docker

Use the provided `Dockerfile` and `docker-compose.yml`. The compose file mounts
`/srv/excalidraw/drawings` from your host into the app container, so saves go
straight to your server storage.

## Nginx

Proxy `/drawpad/`, `/api/`, and `/_next/` to the Next.js container. See `nginx.conf`.
