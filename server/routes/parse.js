import { Router } from 'express';
import { jsonCompletion } from '../lib/json.js';
import { apiError } from '../featherless.js';
import { VISION_SYSTEM } from '../prompts.js';

const router = Router();

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // Featherless vision limit

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (TIME_RE.test(s)) return s;
  // tolerate "7:05" and "7:05 AM" style output
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const mer = m[3]?.toLowerCase();
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function validateSleepData(obj) {
  const required = ['source_app', 'bedtime', 'wake_time', 'duration_minutes', 'confidence'];
  const missing = required.filter((k) => !(k in obj));
  if (missing.length) throw new Error(`Missing keys: ${missing.join(', ')}`);

  const duration = obj.duration_minutes == null ? null : Number(obj.duration_minutes);
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 60)) {
    throw new Error(`duration_minutes is not a plausible number of minutes: ${obj.duration_minutes}`);
  }

  return {
    source_app: obj.source_app == null ? null : String(obj.source_app),
    bedtime: normalizeTime(obj.bedtime),
    wake_time: normalizeTime(obj.wake_time),
    duration_minutes: duration,
    sleep_quality: obj.sleep_quality == null ? null : String(obj.sleep_quality),
    confidence: ['high', 'medium', 'low'].includes(obj.confidence) ? obj.confidence : 'low',
    notes: obj.notes == null ? null : String(obj.notes),
  };
}

router.post('/parse', async (req, res, next) => {
  try {
    const { image } = req.body ?? {};
    if (typeof image !== 'string' || !DATA_URL_RE.test(image)) {
      throw apiError('Expected "image" as a base64 data URL (png, jpeg, or webp).', 'BAD_IMAGE', 400);
    }
    const approxBytes = (image.length - image.indexOf(',') - 1) * 0.75;
    if (approxBytes > MAX_IMAGE_BYTES) {
      throw apiError('Image is larger than 20MB — please upload a smaller screenshot.', 'IMAGE_TOO_LARGE', 400);
    }

    const sleep = await jsonCompletion({
      model: process.env.VISION_MODEL || 'google/gemma-3-27b-it',
      temperature: 0.1,
      messages: [
        { role: 'system', content: VISION_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the sleep data from this screenshot.' },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      validate: validateSleepData,
    });

    res.json({ sleep });
  } catch (e) {
    next(e);
  }
});

export default router;
