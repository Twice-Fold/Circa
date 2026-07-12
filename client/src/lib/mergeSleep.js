// Reconciles multiple vision-parse results (one per screenshot) into a single
// sleep summary. Sources are ranked by how much they actually contain, so a
// detailed stage-breakdown screenshot outranks a sparse summary tile when the
// two disagree; complementary fields fill in from whichever source has them.

const TOP_FIELDS = ['bedtime', 'wake_time', 'duration_minutes', 'sleep_quality'];
const STAGE_KEYS = ['light_minutes', 'deep_minutes', 'rem_minutes', 'awake_minutes'];
const CONFIDENCE_RANK = { high: 2, medium: 1, low: 0 };

function detailScore(sleep) {
  let score = 0;
  for (const key of TOP_FIELDS) if (sleep[key] != null) score += 1;
  for (const key of STAGE_KEYS) if (sleep.stages?.[key] != null) score += 1;
  return score;
}

export function mergeSleepResults(results) {
  if (results.length === 1) return results[0];

  const ranked = [...results].sort(
    (a, b) =>
      detailScore(b) - detailScore(a) ||
      (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0)
  );

  const merged = { ...ranked[0] };
  for (const key of ['source_app', ...TOP_FIELDS, 'notes']) {
    merged[key] = ranked.find((s) => s[key] != null)?.[key] ?? null;
  }

  const stages = {};
  let hasStages = false;
  for (const key of STAGE_KEYS) {
    const value = ranked.find((s) => s.stages?.[key] != null)?.stages[key] ?? null;
    stages[key] = value;
    if (value != null) hasStages = true;
  }
  merged.stages = hasStages ? stages : null;

  merged.confidence = ranked[0].confidence ?? 'low';
  return merged;
}
