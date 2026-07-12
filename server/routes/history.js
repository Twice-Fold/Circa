import { Router } from 'express';
import { verifyIdToken, getOrCreateGregKey } from '../lib/firebase.js';
import { fetchSchedulesFromGreg, deleteScheduleFromGreg } from '../lib/greg.js';

const router = Router();

// Past schedules: verify the caller's Firebase session, pull their key from
// Firestore, then ask Greg to decrypt with it. The frontend never sees the
// key and Greg never keeps it.
router.get('/history', async (req, res, next) => {
  try {
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const uid = await verifyIdToken(token);
    const key = await getOrCreateGregKey(uid);
    const schedules = await fetchSchedulesFromGreg(uid, key);
    res.json({ schedules });
  } catch (e) {
    next(e);
  }
});

// Deleting is uid-scoped on Greg's side, so a verified token can only ever
// remove that user's own record.
router.delete('/history/:id', async (req, res, next) => {
  try {
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const uid = await verifyIdToken(token);
    await deleteScheduleFromGreg(uid, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
