import { apiError } from '../featherless.js';

/**
 * Client for Greg, the encrypted schedule store on the home server. Greg
 * holds ciphertext; the per-user key rides along in the X-Data-Key header
 * and is never persisted there.
 */

const GREG_URL = () => (process.env.GREG_URL || 'https://greg.circaproductivity.xyz').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;

// Greg only answers requests carrying the shared secret — proof the call
// came from this backend and not from anyone who found the tunnel URL.
function gregHeaders(extra = {}) {
  const secret = process.env.GREG_INTERNAL_SECRET;
  return { ...(secret ? { 'X-Internal-Auth': secret } : {}), ...extra };
}

/** Best-effort: callers treat failures as non-fatal (history just isn't saved). */
export async function saveScheduleToGreg({ uid, key, mode, sleep, tasks, schedule }) {
  const res = await fetch(`${GREG_URL()}/schedules`, {
    method: 'POST',
    headers: gregHeaders({ 'Content-Type': 'application/json', 'X-Data-Key': key }),
    body: JSON.stringify({ uid, mode, sleep, tasks, schedule }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Greg returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function getDocFromGreg(uid, type, key) {
  let res;
  try {
    res = await fetch(`${GREG_URL()}/docs/${encodeURIComponent(uid)}/${type}`, {
      headers: gregHeaders({ 'X-Data-Key': key }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw apiError('Your storage is unreachable right now — try again in a bit.', 'GREG_UNREACHABLE', 503);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data?.error || `Storage returned ${res.status}.`, data?.code || 'GREG_ERROR', 502);
  }
  return data.data;
}

export async function putDocToGreg(uid, type, key, payload) {
  let res;
  try {
    res = await fetch(`${GREG_URL()}/docs/${encodeURIComponent(uid)}/${type}`, {
      method: 'PUT',
      headers: gregHeaders({ 'Content-Type': 'application/json', 'X-Data-Key': key }),
      body: JSON.stringify({ data: payload }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw apiError('Your storage is unreachable right now — changes were not saved.', 'GREG_UNREACHABLE', 503);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data?.error || `Storage returned ${res.status}.`, data?.code || 'GREG_ERROR', 502);
  }
}

export async function deleteScheduleFromGreg(uid, scheduleId) {
  let res;
  try {
    res = await fetch(`${GREG_URL()}/schedules/${encodeURIComponent(uid)}/${encodeURIComponent(scheduleId)}`, {
      method: 'DELETE',
      headers: gregHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw apiError('Your schedule storage is unreachable right now — nothing was deleted.', 'GREG_UNREACHABLE', 503);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data?.error || `Storage returned ${res.status}.`, data?.code || 'GREG_ERROR', res.status === 404 ? 404 : 502);
  }
}

export async function fetchSchedulesFromGreg(uid, key) {
  let res;
  try {
    res = await fetch(`${GREG_URL()}/schedules/${encodeURIComponent(uid)}`, {
      headers: gregHeaders({ 'X-Data-Key': key }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw apiError('Your schedule storage is unreachable right now — try again in a bit.', 'GREG_UNREACHABLE', 503);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data?.error || `Storage returned ${res.status}.`, data?.code || 'GREG_ERROR', 502);
  }
  return data.schedules ?? [];
}
