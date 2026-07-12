# Greg — Circa's storage server

Standalone Express + SQLite server that stores past schedules, meant to run on
the home server behind a Cloudflare Tunnel. Separate from the main Cloud Run
backend (`server/`).

## Key-split encryption

Every record's payload (sleep data, tasks, generated schedule) is encrypted
with AES-256-GCM before it touches SQLite. **Greg never stores a key.** The
per-user 256-bit key lives in Firestore, managed by the Cloud Run backend,
which sends it with each request as a header:

```
X-Data-Key: <base64 of 32 random bytes>
```

Only `uid`, `mode`, and `created_at` are plaintext (for lookup and sorting).
If Greg's disk is stolen, the schedules are unreadable without the keys in
Firestore — and Firestore alone holds keys to data it doesn't have.

## Endpoints

- `GET /health` → `{ ok: true, name: "greg" }`
- `POST /schedules` — body `{ uid, mode: "flow"|"rhythm", sleep, tasks?, schedule }`,
  header `X-Data-Key`. Returns `201 { id, created_at }`.
- `GET /schedules/:uid` — header `X-Data-Key`. Returns
  `{ schedules: [{ id, mode, created_at, sleep, tasks, schedule }] }`,
  most recent first. Wrong key → `403 WRONG_KEY`.

Raw screenshots / export files are rejected (`RAW_MEDIA_REJECTED`) — Greg
stores parsed JSON only, and bodies are capped at 256 KB.

## Run

```bash
cp .env.example .env   # adjust if needed
npm install
npm start              # listens on PORT (default 3001)
```
