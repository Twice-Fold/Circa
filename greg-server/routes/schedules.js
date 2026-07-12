import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { insertSchedule, listSchedulesByUid, deleteScheduleById } from '../db.js';
import { parseKey, encrypt, decrypt } from '../crypto.js';

const router = Router();

const MODES = new Set(['nyx', 'flow', 'rhythm']);
const MAX_STRING_CHARS = 4000; // any legitimate parsed field is far smaller

function apiError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

// Greg stores parsed JSON only. Base64 screenshots and export blobs announce
// themselves as very long strings or data: URLs — reject both, recursively.
function assertNoRawMedia(value, path = 'payload') {
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_CHARS) {
      throw apiError(`"${path}" is too long — Greg stores parsed data, not raw files.`, 'RAW_MEDIA_REJECTED', 400);
    }
    if (/^data:\w+\//.test(value)) {
      throw apiError(`"${path}" looks like an embedded file — Greg stores parsed data only.`, 'RAW_MEDIA_REJECTED', 400);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoRawMedia(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoRawMedia(v, `${path}.${k}`);
  }
}

function requireKey(req) {
  const key = parseKey(req.get('x-data-key'));
  if (!key) {
    throw apiError('Missing or invalid X-Data-Key header (expected base64 of 32 bytes).', 'BAD_KEY', 400);
  }
  return key;
}

router.post('/schedules', (req, res, next) => {
  try {
    const key = requireKey(req);
    const { uid, mode, sleep, tasks, schedule } = req.body ?? {};

    if (typeof uid !== 'string' || !uid.trim() || uid.length > 128) {
      throw apiError('Expected "uid" as a non-empty string.', 'BAD_UID', 400);
    }
    if (!MODES.has(mode)) {
      throw apiError('Expected "mode" to be "nyx", "flow", or "rhythm".', 'BAD_MODE', 400);
    }
    if (!sleep || typeof sleep !== 'object' || Array.isArray(sleep)) {
      throw apiError('Expected "sleep" as an object of parsed sleep data.', 'BAD_SLEEP', 400);
    }
    if (
      !schedule ||
      typeof schedule !== 'object' ||
      typeof schedule.summary !== 'string' ||
      !Array.isArray(schedule.blocks)
    ) {
      throw apiError('Expected "schedule" with a summary and blocks array.', 'BAD_SCHEDULE', 400);
    }
    if (tasks !== undefined && !Array.isArray(tasks)) {
      throw apiError('Expected "tasks" to be an array when provided.', 'BAD_TASKS', 400);
    }

    const payload = { sleep, tasks: tasks ?? [], schedule };
    assertNoRawMedia(payload);

    const record = {
      id: randomUUID(),
      uid: uid.trim(),
      mode,
      created_at: new Date().toISOString(),
      ...encrypt(key, payload),
    };
    insertSchedule.run(record);

    res.status(201).json({ id: record.id, created_at: record.created_at });
  } catch (e) {
    next(e);
  }
});

router.get('/schedules/:uid', (req, res, next) => {
  try {
    const key = requireKey(req);
    const rows = listSchedulesByUid.all(req.params.uid);

    const schedules = [];
    let failed = 0;
    for (const row of rows) {
      try {
        const payload = decrypt(key, row);
        schedules.push({
          id: row.id,
          mode: row.mode,
          created_at: row.created_at,
          sleep: payload.sleep,
          tasks: payload.tasks ?? [],
          schedule: payload.schedule,
        });
      } catch {
        failed += 1;
      }
    }

    if (rows.length > 0 && schedules.length === 0) {
      throw apiError('No record could be decrypted — wrong key for this user?', 'WRONG_KEY', 403);
    }
    res.json({ schedules, ...(failed > 0 ? { undecryptable: failed } : {}) });
  } catch (e) {
    next(e);
  }
});

// Deleting needs no data key — the uid scoping means a caller (always our
// backend, thanks to the shared-secret gate) can only remove that user's row.
router.delete('/schedules/:uid/:id', (req, res, next) => {
  try {
    const result = deleteScheduleById.run(req.params.id, req.params.uid);
    if (result.changes === 0) {
      throw apiError('No such schedule for this user.', 'NOT_FOUND', 404);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
