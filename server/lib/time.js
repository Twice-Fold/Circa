export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Normalize model output like "7:05", "7:05 AM", "23:30" to 24h "HH:MM"; null if hopeless.
export function normalizeTime(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (TIME_RE.test(s)) return s;
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
