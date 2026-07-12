import { Router } from 'express';
import { verifyIdToken, getOrCreateGregKey } from '../lib/firebase.js';
import { getDocFromGreg, putDocToGreg } from '../lib/greg.js';
import { apiError } from '../featherless.js';

const router = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES = new Set(['high', 'medium', 'low']);
const MAX_ITEMS = 100;

async function authedKey(req) {
  const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const uid = await verifyIdToken(token);
  const key = await getOrCreateGregKey(uid);
  return { uid, key };
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function sanitizeTodo(t) {
  const name = str(t?.name, 120);
  const minutes = Number(t?.minutes);
  if (!name || !Number.isFinite(minutes) || minutes < 5 || minutes > 8 * 60) return null;
  return {
    id: str(t?.id, 64) ?? crypto.randomUUID(),
    name,
    minutes: Math.round(minutes),
    priority: PRIORITIES.has(t?.priority) ? t.priority : null,
    deadline: TIME_RE.test(t?.deadline ?? '') ? t.deadline : null,
    recurring: Boolean(t?.recurring),
    notes: str(t?.notes, 500),
    completed: Boolean(t?.completed) && !t?.recurring, // recurring tasks never complete
    scheduledFor: /^\d{4}-\d{2}-\d{2}$/.test(t?.scheduledFor ?? '') ? t.scheduledFor : null,
  };
}

function sanitizeRoutine(r) {
  const name = str(r?.name, 120);
  const start = TIME_RE.test(r?.start ?? '') ? r.start : null;
  if (!name || !start) return null;
  const days = Array.isArray(r?.days)
    ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : [];
  if (days.length === 0) return null;
  return {
    id: str(r?.id, 64) ?? crypto.randomUUID(),
    name,
    start,
    end: TIME_RE.test(r?.end ?? '') ? r.end : null,
    days,
    fixed: Boolean(r?.fixed),
  };
}

function makeDocRoutes(type, sanitizeItem) {
  router.get(`/${type}`, async (req, res, next) => {
    try {
      const { uid, key } = await authedKey(req);
      const data = await getDocFromGreg(uid, type, key);
      res.json({ [type]: data ?? [] });
    } catch (e) {
      next(e);
    }
  });

  router.put(`/${type}`, async (req, res, next) => {
    try {
      const { uid, key } = await authedKey(req);
      const raw = req.body?.[type];
      if (!Array.isArray(raw)) throw apiError(`Expected "${type}" as an array.`, 'BAD_BODY', 400);
      const clean = raw.slice(0, MAX_ITEMS).map(sanitizeItem).filter(Boolean);
      await putDocToGreg(uid, type, key, clean);
      res.json({ [type]: clean });
    } catch (e) {
      next(e);
    }
  });
}

makeDocRoutes('todos', sanitizeTodo);
makeDocRoutes('routines', sanitizeRoutine);

export default router;
