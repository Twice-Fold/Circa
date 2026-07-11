# Circa

AI-powered schedule app that reads your sleep patterns from a health-app screenshot and builds your day around your actual biology.

## MVP flow (Circa Flow)

1. **Upload** a sleep screenshot (Apple Health, Google Fit, Fitbit, …)
2. **Vision parse** — `google/gemma-3-27b-it` on Featherless extracts bedtime / wake time / duration / quality; you confirm or correct it
3. **Circa Flow** — anonymized signals only (never the screenshot) go to the reasoning model (`deepseek-ai/DeepSeek-V4-Pro`, reasoning disabled) which returns a time-blocked schedule where every block explains *why* it's placed there

## Run it

```bash
# 1. Paste your Featherless API key into server/.env

# 2. Server (port 3001)
cd server && npm install && npm run dev

# 3. Client (port 5173, proxies /api to the server)
cd client && npm install && npm run dev
```

Open http://localhost:5173.

## Error handling

- Model JSON output goes through a tolerant extractor (markdown fences, surrounding prose) + schema validation; on failure the server retries once, feeding the validation error back to the model
- Upstream calls have 90s timeouts; all failures reach the UI as readable messages with `{ error, code }`
- The confirm screen is the last line of defense: any field the vision model misreads can be hand-corrected before scheduling
- Client validates file type/size before upload

## Privacy architecture (full design — storage not in this build yet)

Raw sleep data → encrypted at rest on a home server ("Greg"); decryption key stored separately (Firebase/Cloud KMS). Neither half alone is useful to an attacker. The AI only ever receives anonymized signals — enforced by a whitelist in `server/routes/schedule.js`. This demo build is stateless: nothing is persisted.

## Config (`server/.env`)

| Var | Default | |
|---|---|---|
| `FEATHERLESS_API_KEY` | — | required |
| `VISION_MODEL` | `google/gemma-3-27b-it` | any Featherless vision-class model |
| `REASONING_MODEL` | `deepseek-ai/DeepSeek-V4-Pro` | swap for Kimi/GLM A/B tests |
