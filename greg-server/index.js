import 'dotenv/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import schedulesRouter from './routes/schedules.js';
import docsRouter from './routes/docs.js';

// Only the Cloud Run backend knows this secret; without it, Greg answers
// nothing. Fail closed: refusing to start beats silently serving the world.
const INTERNAL_SECRET = process.env.GREG_INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  console.error('GREG_INTERNAL_SECRET is not set — refusing to start unauthenticated. Add it to greg-server/.env.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3005; // matches the Cloudflare Tunnel config

// Behind the Cloudflare Tunnel every request arrives from localhost; trust
// one proxy hop so rate limiting keys on the real client IP.
app.set('trust proxy', 1);

// Server-to-server calls don't need CORS, but if the Cloud Run backend ever
// proxies browser requests through, only its domain is allowed.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  })
);

app.use(express.json({ limit: '256kb' })); // parsed JSON only — no file-sized bodies

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — slow down.', code: 'RATE_LIMITED' },
  })
);

// Liveness stays public (the tunnel and uptime checks hit it); everything
// that touches data requires the shared secret.
app.get('/health', (req, res) => {
  res.json({ ok: true, name: 'greg' });
});

// Shared-secret gate: runs before any route logic, so nothing — including
// X-Data-Key decryption — happens for callers that aren't our backend.
const secretDigest = createHash('sha256').update(INTERNAL_SECRET).digest();
app.use((req, res, next) => {
  const presented = req.get('x-internal-auth') ?? '';
  const presentedDigest = createHash('sha256').update(presented).digest();
  if (!timingSafeEqual(presentedDigest, secretDigest)) {
    return res.status(401).json({ error: 'Unauthorized.', code: 'BAD_INTERNAL_AUTH' });
  }
  next();
});

app.use('/', schedulesRouter);
app.use('/', docsRouter);

// Central error handler: every failure reaches the caller as { error, code }.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Body too large — Greg stores parsed JSON, not files.', code: 'BODY_TOO_LARGE' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body is not valid JSON.', code: 'BAD_JSON' });
  }
  const status = err.status || 500;
  const code = err.code || 'INTERNAL';
  if (status >= 500) console.error(`[${code}]`, err.message);
  res.status(status).json({ error: err.message, code });
});

app.listen(PORT, () => {
  console.log(`Greg storage server listening on http://localhost:${PORT}`);
});
