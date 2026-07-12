# Circa

Circa is an AI-powered personal schedule builder that ingests sleep data (screenshots or exports), extracts your sleep window and quality, and returns a time-blocked day planned around your biology.

What’s new in this checkpoint
- Full React client with pages: Scheduler, Routines, Settings, Auth, and Account
- Robust vision parsing and validation (server/routes/parse.js)
- Schedule generation pipeline (server/routes/schedule.js) with model retries & tolerant JSON extraction
- Greg local store (greg-server) for encrypted-at-rest schedules and example data
- Dockerfile for server; env examples added for client and greg-server
- Privacy enforcement: server whitelists/anonymizes fields before sending to models

Quickstart — local (developer)
1) Server
   cd server
   cp .env.example .env  # add FEATHERLESS_API_KEY and other values
   npm install
   npm run dev            # watches index.js, default port: 3001

2) Greg (optional local store)
   cd greg-server
   npm install
   npm start              # runs greg server (see greg-server/.env.example)

3) Client
   cd client
   npm install
   npm run dev            # Vite dev server, default port: 5173 — proxies /api to server

Open: http://localhost:5173

Running with Docker
- A Dockerfile is provided in server/ for production container builds. Build and run as you would any Node service; ensure required env vars are passed at runtime.

Environment variables (high-level)
- server/.env (examples)
  - FEATHERLESS_API_KEY — required (vision API)
  - VISION_MODEL — default: google/gemma-3-27b-it
  - REASONING_MODEL — default: deepseek-ai/DeepSeek-V4-Pro
  - GREG_URL — optional: URL of greg-server for encrypted storage
- greg-server/.env.example — local DB path and rate-limit options
- client/.env.example — Firebase or hosting config when used

API overview (server/routes)
- POST /api/parse     — upload screenshot / export, returns parsed sleep windows
- POST /api/schedule  — generate a schedule from confirmed/parsed sleep data
- POST /api/chat      — conversational helpers / follow-ups
- GET  /api/history   — list previously generated schedules (when Greg enabled)
- GET  /api/userdata  — user-level metadata for account flows

Error handling & validation
- Model outputs are parsed with a tolerant extractor then validated against expected schema; on schema failure the server retries once with the model, returning useful error hints to the UI
- Upstream calls enforce timeouts and surface machine-readable { error, code } objects to the client

Privacy by design
- Raw screenshots are not forwarded to AI models; only anonymized, whitelisted signals are sent
- Greg (optional) stores encrypted schedules; decryption keys must be kept separate
- The confirm screen in the client is always required before any schedule is generated or persisted

Contributing
- Run linters/tests if present, follow existing code style
- New features should include brief README updates where appropriate