import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { jsonCompletion } from '../lib/json.js';
import { normalizeStages } from '../lib/stages.js';
import { verifyIdToken, getOrCreateGregKey } from '../lib/firebase.js';
import { saveScheduleToGreg } from '../lib/greg.js';
import { apiError } from '../featherless.js';
import { SCHEDULE_SYSTEM, scheduleUserMessage } from '../prompts.js';

const router = Router();

// Schedule generation runs as a server-side background job: POST returns a
// job id immediately and the client polls. A refresh mid-generation doesn't
// abandon the (expensive, 4-concurrency-unit) upstream request — the client
// just re-attaches to the job and picks up the result.
const jobs = new Map(); // id → { status: 'running'|'done'|'error', ... }
const JOB_TTL_MS = 15 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}, 60_000).unref();

// DeepSeek needs the plan's full concurrency budget, so generations are
// strictly serialized — a second request queues instead of tripping 429s.
let generationQueue = Promise.resolve();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const CATEGORIES = ['deep_work', 'light_work', 'break', 'meal', 'exercise', 'winddown'];
const TIMELINE_STAGES = new Set(['light', 'deep', 'rem', 'awake', 'asleep', 'inbed']);
const MAX_TIMELINE_ENTRIES = 80;

// Health-export imports carry the night's exact stage sequence. Keep only
// stage names, clock times, and durations — nothing else survives.
function sanitizedTimeline(detail) {
  if (!Array.isArray(detail?.timeline)) return null;
  const timeline = detail.timeline
    .filter(
      (t) =>
        TIMELINE_STAGES.has(t?.stage) &&
        CLOCK_RE.test(t?.start ?? '') &&
        CLOCK_RE.test(t?.end ?? '') &&
        Number.isFinite(Number(t?.minutes)) &&
        Number(t.minutes) > 0
    )
    .slice(0, MAX_TIMELINE_ENTRIES)
    .map((t) => ({ stage: t.stage, start: t.start, end: t.end, minutes: Math.round(Number(t.minutes) * 10) / 10 }));
  if (timeline.length < 2) return null;

  const awakenings = Number(detail.awakenings);
  return {
    timeline,
    awakenings: Number.isFinite(awakenings) && awakenings >= 0 ? Math.round(awakenings) : undefined,
  };
}

const PRIORITIES = new Set(['high', 'medium', 'low']);
const MAX_TASKS = 10;

// User tasks are meant for the model, but still pass a strict whitelist:
// name, minutes, priority, deadline, notes — nothing else rides along.
function sanitizeTasks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_TASKS)
    .map((t) => {
      const name = String(t?.name ?? '').trim().slice(0, 120);
      const minutes = Number(t?.minutes);
      if (!name || !Number.isFinite(minutes) || minutes < 5 || minutes > 8 * 60) return null;
      const notes = typeof t?.notes === 'string' && t.notes.trim() ? t.notes.trim().slice(0, 300) : null;
      return {
        name,
        minutes: Math.round(minutes),
        priority: PRIORITIES.has(t?.priority) ? t.priority : null,
        deadline: TIME_RE.test(t?.deadline ?? '') ? t.deadline : null,
        ...(notes ? { notes } : {}),
      };
    })
    .filter(Boolean);
}

// Routines are the day's fixed anchors: name + time(s) + whether they can
// flex. The client sends only the ones that apply to today.
function sanitizeRoutines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map((r) => {
      const name = String(r?.name ?? '').trim().slice(0, 120);
      const start = TIME_RE.test(r?.start ?? '') ? r.start : null;
      if (!name || !start) return null;
      return {
        name,
        start,
        end: TIME_RE.test(r?.end ?? '') ? r.end : null,
        fixed: Boolean(r?.fixed),
      };
    })
    .filter(Boolean);
}

// Only these anonymized signals ever leave for the AI — never the raw
// screenshot, never anything identifying. This whitelist is the enforcement.
function anonymizedSignals(sleep) {
  const duration = Number(sleep?.duration_minutes);
  const nightDetail = sanitizedTimeline(sleep?.detail);
  return {
    bedtime: TIME_RE.test(sleep?.bedtime ?? '') ? sleep.bedtime : null,
    wake_time: TIME_RE.test(sleep?.wake_time ?? '') ? sleep.wake_time : null,
    duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    sleep_quality: sleep?.sleep_quality == null ? null : String(sleep.sleep_quality).slice(0, 120),
    stages: normalizeStages(sleep?.stages),
    ...(nightDetail ? { night_timeline: nightDetail.timeline, awakenings: nightDetail.awakenings } : {}),
  };
}

function validateSchedule(obj) {
  if (typeof obj.summary !== 'string' || !obj.summary.trim()) {
    throw new Error('Missing "summary" string');
  }
  if (!Array.isArray(obj.blocks) || obj.blocks.length < 4) {
    throw new Error(`"blocks" must be an array of at least 4 blocks, got ${obj.blocks?.length ?? 'none'}`);
  }
  const blocks = obj.blocks.map((b, i) => {
    for (const key of ['start', 'end', 'title', 'why']) {
      if (typeof b[key] !== 'string' || !b[key].trim()) {
        throw new Error(`Block ${i} is missing "${key}"`);
      }
    }
    if (!TIME_RE.test(b.start) || !TIME_RE.test(b.end)) {
      throw new Error(`Block ${i} has non-HH:MM times: ${b.start}–${b.end}`);
    }
    return {
      start: b.start,
      end: b.end,
      title: b.title.trim(),
      category: CATEGORIES.includes(b.category) ? b.category : 'light_work',
      why: b.why.trim(),
      task: typeof b.task === 'string' && b.task.trim() ? b.task.trim() : null,
      routine: typeof b.routine === 'string' && b.routine.trim() ? b.routine.trim() : null,
    };
  });
  return { summary: obj.summary.trim(), blocks };
}

// Saving history is strictly best-effort: if Greg is down or unreachable,
// the user still gets their schedule — it just isn't remembered.
async function saveHistory(uid, signals, tasks, mode, schedule) {
  try {
    const key = await getOrCreateGregKey(uid);
    await saveScheduleToGreg({ uid, key, mode, sleep: signals, tasks, schedule });
    console.log(`[greg] saved schedule for ${uid.slice(0, 8)}…`);
  } catch (e) {
    console.warn(`[greg] history save skipped: ${e.message}`);
  }
}

// Three speed tiers, fastest first. Nyx: small model, no reasoning. Flow:
// gpt-oss-120b at low reasoning effort (it can't disable reasoning entirely —
// expect ~30-45s and a reasoning_content field upstream). Rhythm: DeepSeek
// with full native thinking, the slowest and deepest.
const MODE_TIERS = {
  nyx: {
    model: () => process.env.NYX_MODEL || 'Qwen/Qwen3.5-9B',
    maxTokens: 2000,
    timeoutMs: 90_000,
    // Qwen thinks by default (into a `reasoning` field) and will burn the
    // whole token budget on it — this template switch turns it off.
    extra: { chat_template_kwargs: { enable_thinking: false } },
  },
  flow: {
    model: () => process.env.FLOW_MODEL || 'openai/gpt-oss-120b',
    maxTokens: 4000, // reasoning tokens count toward the budget
    timeoutMs: 300_000, // measured: this workload can exceed 3 minutes upstream
    extra: { reasoning_effort: 'low' },
  },
  rhythm: {
    model: () => process.env.REASONING_MODEL || 'deepseek-ai/DeepSeek-V4-Pro',
    maxTokens: 6000,
    timeoutMs: 600_000, // full thinking has been observed near 10 minutes
    extra: {},
  },
};

// Last generation per user, for the dev-only debug console. Holds request
// shape and timing — never API keys, and only ever served back to the same
// uid that ran the generation.
const lastGenerationByUid = new Map();
const MAX_DEBUG_ENTRIES = 100;

export function getLastGeneration(uid) {
  return lastGenerationByUid.get(uid) ?? null;
}

async function runGeneration(job, signals, tasks, routines, mode, uid) {
  const tier = MODE_TIERS[mode];
  const model = tier.model();
  const userMessage = scheduleUserMessage(signals, tasks, routines);
  const startedAt = Date.now();
  const debug = {
    at: new Date().toISOString(),
    mode,
    model,
    request: {
      temperature: 0.5,
      max_tokens: tier.maxTokens,
      timeout_ms: tier.timeoutMs,
      extra: tier.extra,
      system_prompt_chars: SCHEDULE_SYSTEM.length,
      user_message_chars: userMessage.length,
      user_message: userMessage,
    },
  };

  try {
    const schedule = await jsonCompletion({
      model,
      temperature: 0.5,
      maxTokens: tier.maxTokens,
      timeoutMs: tier.timeoutMs,
      extra: tier.extra,
      signal: job.controller.signal,
      messages: [
        { role: 'system', content: SCHEDULE_SYSTEM },
        { role: 'user', content: userMessage },
      ],
      validate: validateSchedule,
    });
    Object.assign(job, { status: 'done', schedule, signals, mode });
    Object.assign(debug, { status: 'done', duration_ms: Date.now() - startedAt, error: null });
    if (uid) saveHistory(uid, signals, tasks, mode, schedule); // fire-and-forget
  } catch (e) {
    const cancelled = job.status === 'cancelled' || e.code === 'CLIENT_ABORTED';
    Object.assign(debug, {
      status: cancelled ? 'cancelled' : 'error',
      duration_ms: Date.now() - startedAt,
      error: cancelled ? null : { code: e.code ?? 'SCHEDULE_FAILED', message: e.message },
    });
    if (cancelled) {
      console.log('[schedule] job cancelled — upstream request aborted');
      job.status = 'cancelled';
    } else {
      console.error(`[schedule] job failed: [${e.code ?? 'SCHEDULE_FAILED'}] ${e.message}`);
      Object.assign(job, { status: 'error', error: e.message, code: e.code ?? 'SCHEDULE_FAILED' });
    }
  } finally {
    if (uid) {
      lastGenerationByUid.set(uid, debug);
      if (lastGenerationByUid.size > MAX_DEBUG_ENTRIES) {
        lastGenerationByUid.delete(lastGenerationByUid.keys().next().value);
      }
    }
  }
}

router.post('/schedule', async (req, res, next) => {
  try {
    const signals = anonymizedSignals(req.body?.sleep);
    if (!signals.bedtime && !signals.wake_time && !signals.duration_minutes) {
      throw apiError(
        'Need at least one of bedtime, wake_time, or duration_minutes to build a schedule.',
        'NO_SIGNALS',
        400
      );
    }

    // Unknown/missing mode falls back to the fastest tier.
    const mode = MODE_TIERS[req.body?.mode] ? req.body.mode : 'nyx';

    const tasks = sanitizeTasks(req.body?.tasks);
    const routines = sanitizeRoutines(req.body?.routines);

    // Signed-in users get their schedule saved to Greg on completion. A
    // missing or invalid token never blocks generation — it just isn't saved.
    let uid = null;
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        uid = await verifyIdToken(token);
      } catch {
        uid = null;
      }
    }

    const jobId = randomUUID();
    // The controller lets a Stop press cancel the upstream Featherless call —
    // otherwise an unwanted generation keeps holding concurrency units.
    const job = { status: 'running', createdAt: Date.now(), controller: new AbortController() };
    jobs.set(jobId, job);
    generationQueue = generationQueue.then(() => runGeneration(job, signals, tasks, routines, mode, uid));

    res.status(202).json({ jobId });
  } catch (e) {
    next(e);
  }
});

router.get('/schedule/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ status: 'error', error: 'That schedule request expired or never existed.', code: 'JOB_NOT_FOUND' });
  }
  if (job.status === 'running') return res.json({ status: 'running' });
  if (job.status === 'cancelled') return res.json({ status: 'cancelled' });
  if (job.status === 'error') return res.status(502).json({ status: 'error', error: job.error, code: job.code });
  res.json({ status: 'done', schedule: job.schedule, signals: job.signals, mode: job.mode });
});

// Stop button: mark the job cancelled and abort its upstream request.
router.post('/schedule/:jobId/cancel', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ status: 'error', error: 'That schedule request expired or never existed.', code: 'JOB_NOT_FOUND' });
  }
  if (job.status === 'running') {
    job.status = 'cancelled';
    job.controller.abort();
  }
  res.json({ status: job.status });
});

export default router;
