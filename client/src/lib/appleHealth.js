/**
 * Extracts last night's sleep from an Apple Health export.xml, producing the
 * same summary shape the screenshot and chat flows use. Pure string scanning —
 * no DOM, no XML parser — so it runs in a Web Worker and stays fast on the
 * multi-hundred-MB files Health exports grow into.
 */

const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';
const SESSION_GAP_MS = 3 * 60 * 60 * 1000; // a 3h+ gap between records = separate sleep session
const MIN_REAL_SLEEP_MINUTES = 45; // skip trailing naps when picking "last night"

// Health export values, old and new formats, → our record kinds.
const VALUE_KINDS = {
  InBed: 'inbed',
  Asleep: 'asleep',
  AsleepUnspecified: 'asleep',
  AsleepCore: 'light',
  AsleepDeep: 'deep',
  AsleepREM: 'rem',
  Awake: 'awake',
  0: 'inbed',
  1: 'asleep',
  2: 'awake',
};
const SLEEP_KINDS = new Set(['asleep', 'light', 'deep', 'rem']);
const STAGE_KINDS = new Set(['light', 'deep', 'rem']);

export function extractSleepFromExportXml(xml) {
  const records = findSleepRecords(xml);
  if (records.length === 0) throw new Error('NO_SLEEP_RECORDS');
  const session = pickSession(groupIntoSessions(records));
  return summarizeSession(session);
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// "2026-07-10 23:31:12 -0700" → epoch ms (absolute) — wall-clock HH:MM is taken
// straight from the string so times display as the device recorded them.
function parseAppleDate(s) {
  if (!s || s.length < 19) return null;
  const iso = `${s.slice(0, 10)}T${s.slice(11, 19)}${s.length >= 25 ? `${s.slice(20, 23)}:${s.slice(23, 25)}` : 'Z'}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function findSleepRecords(xml) {
  const out = [];
  const seen = new Set();
  let idx = 0;
  while ((idx = xml.indexOf(SLEEP_TYPE, idx)) !== -1) {
    const open = xml.lastIndexOf('<', idx);
    const close = xml.indexOf('>', idx);
    idx += SLEEP_TYPE.length;
    if (open === -1 || close === -1) continue;
    const tag = xml.slice(open, close + 1);
    if (!tag.startsWith('<Record')) continue;

    const startDate = attr(tag, 'startDate');
    const endDate = attr(tag, 'endDate');
    const value = attr(tag, 'value');
    const startMs = parseAppleDate(startDate);
    const endMs = parseAppleDate(endDate);
    if (!startMs || !endMs || endMs <= startMs) continue;

    const kind = VALUE_KINDS[String(value ?? '').replace('HKCategoryValueSleepAnalysis', '')];
    if (!kind) continue;

    // Phone + watch both logging the same span shouldn't double-count.
    const key = `${startDate}|${endDate}|${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      startMs,
      endMs,
      minutes: (endMs - startMs) / 60_000,
      startWall: startDate.slice(11, 16),
      endWall: endDate.slice(11, 16),
      startClock: startDate.slice(11, 19), // HH:MM:SS — exports carry second precision
      endClock: endDate.slice(11, 19),
      endDay: endDate.slice(0, 10),
      kind,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

function groupIntoSessions(records) {
  const sessions = [];
  let current = null;
  for (const r of records) {
    if (!current || r.startMs - current.endMs > SESSION_GAP_MS) {
      current = { records: [], endMs: r.endMs };
      sessions.push(current);
    }
    current.records.push(r);
    current.endMs = Math.max(current.endMs, r.endMs);
  }
  return sessions;
}

function asleepMinutes(session) {
  return session.records.filter((r) => SLEEP_KINDS.has(r.kind)).reduce((sum, r) => sum + r.minutes, 0);
}

// Most recent real night; trailing short naps don't count as "last night".
function pickSession(sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (asleepMinutes(sessions[i]) >= MIN_REAL_SLEEP_MINUTES) return sessions[i];
  }
  return sessions[sessions.length - 1];
}

function summarizeSession(session) {
  const recs = session.records;
  const sleepRecs = recs.filter((r) => SLEEP_KINDS.has(r.kind));
  const anchor = sleepRecs.length > 0 ? sleepRecs : recs;

  const first = anchor.reduce((a, b) => (a.startMs <= b.startMs ? a : b));
  const last = anchor.reduce((a, b) => (a.endMs >= b.endMs ? a : b));

  const sums = { light: 0, deep: 0, rem: 0, awake: 0 };
  for (const r of recs) if (r.kind in sums) sums[r.kind] += r.minutes;
  const hasStages = recs.some((r) => STAGE_KINDS.has(r.kind));

  let duration;
  if (hasStages) {
    duration = sums.light + sums.deep + sums.rem;
  } else {
    const asleep = recs.filter((r) => r.kind === 'asleep').reduce((s, r) => s + r.minutes, 0);
    duration = asleep > 0 ? asleep : (last.endMs - first.startMs) / 60_000;
  }

  // The export knows far more than a screenshot: the exact stage-by-stage
  // timeline of the night. Preserve it (sleep data only, no device/source
  // names) so schedule generation can reason about the night's structure.
  // InBed spans overlap the stage records, so drop them when stages exist.
  const timelineSource = sleepRecs.length > 0 ? recs.filter((r) => r.kind !== 'inbed') : recs;
  const tenth = (n) => Math.round(n * 10) / 10;
  const timeline = timelineSource.map((r) => ({
    stage: r.kind,
    start: r.startClock,
    end: r.endClock,
    minutes: tenth(r.minutes),
  }));
  const longest = (stage) =>
    tenth(timeline.filter((t) => t.stage === stage).reduce((max, t) => Math.max(max, t.minutes), 0));
  const detail = {
    timeline,
    awakenings: timeline.filter((t) => t.stage === 'awake').length,
    longest_deep_minutes: longest('deep'),
    longest_rem_minutes: longest('rem'),
  };

  return {
    detail,
    source_app: 'Apple Health',
    origin: 'health_export', // distinguishes this from a screenshot parse in the UI
    bedtime: first.startWall,
    wake_time: last.endWall,
    duration_minutes: Math.round(duration),
    sleep_quality: null,
    stages: hasStages
      ? {
          light_minutes: Math.round(sums.light),
          deep_minutes: Math.round(sums.deep),
          rem_minutes: Math.round(sums.rem),
          awake_minutes: Math.round(sums.awake),
        }
      : null,
    confidence: 'high',
    notes: `Night ending ${last.endDay}.`,
  };
}
