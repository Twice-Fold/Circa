# Circa

Circa is an AI-powered personal schedule builder that ingests sleep data (screenshots or exports), extracts your sleep window and quality, and returns a time-blocked day planned around your biology.

Hackathon overview
- Goal: rapid MVP demonstrating privacy-first, explainable AI scheduling from real sleep signals.
- Target users: busy knowledge workers and early-adopter biohackers who want schedules aligned to sleep and circadian rhythm.
- Demo flow: upload a health-app screenshot → confirm parsed sleep window → generate a personalized, time-blocked day where every block explains why it was placed there.
- Highlights to show: vision parsing accuracy, confirm screen, schedule explanations, encrypted local store (Greg), and privacy enforcement (no raw screenshots sent to models).

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

Hackathon Plan — Circa

**Track:** Solo Hack | General Track
**Goal:** AI-powered schedule app that reads your sleep/energy patterns and builds your day around your actual biology.

1. The Pitch (one paragraph)

> "Most schedule apps treat every hour the same. Circa doesn't. Upload a screenshot of your sleep data from any health app — Apple Health, Google Fit, Fitbit, whatever — and Circa's AI reads it, understands your energy patterns, and builds your day around *you*: when to do deep work, when to take a break, even when to grab coffee. Your raw data stays encrypted on a home server I built myself; the key is managed separately in the cloud, so no single breach exposes anything. Only anonymized signals ever reach the AI."

This paragraph is the quick hook for judges — the technical wow (vision parsing + reasoning) plus the trust story (split-key encryption).

2. Core Architecture

```
[User] --screenshot--> [Web App / Firebase Frontend]
                              |
                    vision model parses image
                    (sleep times, duration, etc.)
                              |
                    structured data --> [Greg: home server]
                    (encrypted at rest)
                              |
              decryption key stored separately
              (Firebase doc or Cloud KMS)
                              |
        anonymized signals only --> [Featherless API]
        (DeepSeek / Kimi / GLM — reasoning model)
                              |
                    schedule suggestions --> back to user
```

Key principle: raw data and the key that unlocks it are never in the same place. Neither half alone is useful.

3. Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend | React (Vite) hosted locally / Firebase | Fast to iterate and demo
| Vision parsing | Featherless vision-capable model | Converts screenshots to structured sleep data
| Reasoning / suggestions | Featherless (DeepSeek/Kimi/GLM) | Produces human-readable schedules with explanations
| Data storage | Greg (home server) — encrypted at rest | Keeps raw data under user control
| Key management | Firebase doc or Cloud KMS (stretch) | Splits key from data for security
| Hosting/infra | Local dev, optional Docker for server | Simple, reproducible demo

4. Feature Scope

MVP (must have for demo):
- Upload a screenshot (or export) of sleep data
- Vision parser extracts bedtime/wake/duration/quality; user confirms
- Encrypted store (Greg) persists optionally
- Reasoning model returns a time-blocked schedule with explanations
- Single-page dashboard that shows the schedule and the privacy explanation

Modes:
- Circa Flow (MVP backbone): reasoning disabled for speed and reliability
- Circa Rhythm (stretch): reasoning enabled, deeper chain-of-thought

Stretch ideas (if time permits): multiple schedule modes, session memory, Health Connect OAuth, timeline UI.

Out of scope for the hackathon: native iOS app, calendar sync, production Cloud KMS (unless time), notifications.

5. Weekend Plan (hour-by-hour summary)

Saturday:
- Morning: Stand up Greg + encrypted storage. Confirm Featherless access and test model outputs.
- Midday: Build screenshot upload + parsing pipeline; test with sample screenshots.
- Afternoon: Wire key-split storage; ensure decryption only happens locally or with explicit consent.
- Evening: Build reasoning prompt and dashboard UI; iterate prompts for clear, actionable schedule items.

Sunday:
- Morning: Polish UI and reliability; add Circa Rhythm toggle only if Flow is stable.
- Midday: End-to-end tests with multiple sample screenshots.
- Before submission: final bug bash and README polish (this file).
---

Notes: keep the README short for judges scanning the repo; use this Hackathon Plan section for the deeper narrative they might read if they want more details.