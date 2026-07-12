const STAGE_KEYS = ['light_minutes', 'deep_minutes', 'rem_minutes', 'awake_minutes'];

// Sanitize an optional stage-breakdown object from model output.
// Returns { light_minutes, deep_minutes, rem_minutes, awake_minutes } with
// nulls for unknowns, or null if nothing usable is present.
export function normalizeStages(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let any = false;
  for (const key of STAGE_KEYS) {
    const v = raw[key] == null ? null : Number(raw[key]);
    out[key] = Number.isFinite(v) && v >= 0 && v <= 24 * 60 ? Math.round(v) : null;
    if (out[key] != null) any = true;
  }
  return any ? out : null;
}
