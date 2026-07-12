import { Router } from 'express';
import { verifyIdTokenInfo } from '../lib/firebase.js';
import { apiError } from '../featherless.js';
import { getLastGeneration } from './schedule.js';

const router = Router();

// Dev-only console, hard-gated to one account. Everyone else gets a 404 so
// the endpoint doesn't even acknowledge it exists. The payload is the
// requester's OWN last generation — never another user's, never API keys.
const DEBUG_EMAIL = process.env.DEBUG_EMAIL || 'mythresh.naveen@gmail.com';

router.get('/debug/last-generation', async (req, res, next) => {
  try {
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { uid, email } = await verifyIdTokenInfo(token);
    if (email !== DEBUG_EMAIL) {
      throw apiError('Not found.', 'NOT_FOUND', 404);
    }
    res.json({ generation: getLastGeneration(uid) });
  } catch (e) {
    next(e);
  }
});

export default router;
