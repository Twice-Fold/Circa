import { Router } from 'express';
import { jsonCompletion } from '../lib/json.js';
import { apiError } from '../featherless.js';
import { SCHEDULE_SYSTEM, scheduleUserMessage } from '../prompts.js';

const router = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CATEGORIES = ['deep_work', 'light_work', 'break', 'meal', 'exercise', 'winddown'];

// Only these anonymized signals ever leave for the AI — never the raw
// screenshot, never anything identifying. This whitelist is the enforcement.
function anonymizedSignals(sleep) {
  const duration = Number(sleep?.duration_minutes);
  return {
    bedtime: TIME_RE.test(sleep?.bedtime ?? '') ? sleep.bedtime : null,
    wake_time: TIME_RE.test(sleep?.wake_time ?? '') ? sleep.wake_time : null,
    duration_minutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    sleep_quality: sleep?.sleep_quality == null ? null : String(sleep.sleep_quality).slice(0, 120),
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
    };
  });
  return { summary: obj.summary.trim(), blocks };
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

    const schedule = await jsonCompletion({
      model: process.env.REASONING_MODEL || 'deepseek-ai/DeepSeek-V4-Pro',
      temperature: 0.5,
      maxTokens: 1600,
      // Circa Flow: reasoning off for fast, reliable generation.
      extra: { reasoning: { type: 'disabled' } },
      messages: [
        { role: 'system', content: SCHEDULE_SYSTEM },
        { role: 'user', content: scheduleUserMessage(signals) },
      ],
      validate: validateSchedule,
    });

    res.json({ schedule, signals });
  } catch (e) {
    next(e);
  }
});

export default router;
