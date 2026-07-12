import { randomBytes } from 'node:crypto';
import { apiError } from '../featherless.js';

/**
 * Firebase glue without the admin SDK: ID tokens are verified through the
 * Identity Toolkit REST API, and per-user Greg keys live in Firestore via its
 * REST API. Both need only the web API key + project id, so this works
 * locally and on Cloud Run alike. (Swap for firebase-admin + locked-down
 * rules when the Firestore test-mode window closes.)
 */

const PROJECT_ID = () => process.env.FIREBASE_PROJECT_ID;
const API_KEY = () => process.env.FIREBASE_API_KEY;

function requireConfig() {
  if (!PROJECT_ID() || !API_KEY()) {
    throw apiError('Firebase is not configured on the server (FIREBASE_PROJECT_ID / FIREBASE_API_KEY).', 'NO_FIREBASE', 500);
  }
}

// Verified tokens are cached briefly so bursts (polling, list refreshes)
// don't hammer the lookup endpoint.
const tokenCache = new Map(); // token → { uid, email, expiresAt }
const TOKEN_CACHE_MS = 5 * 60 * 1000;

/** Verifies a Firebase ID token; resolves to { uid, email }. */
export async function verifyIdTokenInfo(token) {
  requireConfig();
  if (typeof token !== 'string' || token.length < 20) {
    throw apiError('Missing or malformed Authorization token.', 'BAD_TOKEN', 401);
  }

  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached;

  let res;
  try {
    res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw apiError('Could not reach Firebase to verify your session.', 'AUTH_UNREACHABLE', 502);
  }
  const data = await res.json().catch(() => null);
  const user = data?.users?.[0];
  if (!res.ok || !user?.localId) {
    throw apiError('Your session is invalid or expired — sign in again.', 'BAD_TOKEN', 401);
  }

  const info = { uid: user.localId, email: user.email ?? null, expiresAt: Date.now() + TOKEN_CACHE_MS };
  tokenCache.set(token, info);
  if (tokenCache.size > 500) tokenCache.clear(); // crude but sufficient bound
  return info;
}

export async function verifyIdToken(token) {
  return (await verifyIdTokenInfo(token)).uid;
}

const userDocUrl = (uid) =>
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID()}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

/**
 * The "key half" of the key-split: a per-user 256-bit key stored in
 * Firestore (users/{uid}.gregKey). Greg never sees it except transiently in
 * request headers; Firestore never sees the data it unlocks.
 */
export async function getOrCreateGregKey(uid) {
  requireConfig();

  let res;
  try {
    res = await fetch(`${userDocUrl(uid)}?key=${API_KEY()}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw apiError('Could not reach Firestore for your storage key.', 'FIRESTORE_UNREACHABLE', 502);
  }
  const doc = await res.json().catch(() => null);
  const existing = doc?.fields?.gregKey?.stringValue;
  if (existing) return existing;
  if (!res.ok && res.status !== 404) {
    throw apiError(`Firestore key lookup failed (${res.status}).`, 'FIRESTORE_ERROR', 502);
  }

  const fresh = randomBytes(32).toString('base64');
  let patch;
  try {
    patch = await fetch(`${userDocUrl(uid)}?updateMask.fieldPaths=gregKey&key=${API_KEY()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { gregKey: { stringValue: fresh } } }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw apiError('Could not reach Firestore to store your key.', 'FIRESTORE_UNREACHABLE', 502);
  }
  if (!patch.ok) {
    throw apiError(`Firestore key write failed (${patch.status}).`, 'FIRESTORE_ERROR', 502);
  }
  return fresh;
}
