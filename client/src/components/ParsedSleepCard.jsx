import { useState } from 'react';

function computeDuration(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60; // slept past midnight
  return mins;
}

function formatDuration(mins) {
  if (mins == null) return '—';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STAGE_META = [
  { key: 'deep_minutes', label: 'Deep', color: 'var(--winddown)' },
  { key: 'rem_minutes', label: 'REM', color: 'var(--exercise)' },
  { key: 'light_minutes', label: 'Light', color: 'var(--deep)' },
  { key: 'awake_minutes', label: 'Awake', color: 'var(--break)' },
];

const TIMELINE_LABEL = {
  light: 'Light',
  deep: 'Deep',
  rem: 'REM',
  awake: 'Awake',
  asleep: 'Asleep',
  inbed: 'In bed',
};
const TIMELINE_COLOR = {
  light: 'var(--deep)',
  deep: 'var(--winddown)',
  rem: 'var(--exercise)',
  awake: 'var(--break)',
  asleep: 'var(--deep)',
  inbed: 'var(--muted)',
};

// Health exports carry the night's full stage sequence — tucked behind a
// disclosure so the extra precision is there without crowding the card.
function NightTimeline({ detail }) {
  if (!detail?.timeline || detail.timeline.length < 2) return null;
  return (
    <details className="night-timeline">
      <summary>
        Night timeline — {detail.timeline.length} intervals
        {detail.awakenings > 0 && `, woke ${detail.awakenings} time${detail.awakenings === 1 ? '' : 's'}`}
      </summary>
      <ul>
        {detail.timeline.map((t, i) => (
          <li key={i}>
            <span className="tl-time">
              {t.start.slice(0, 5)}<span className="time-sep">–</span>{t.end.slice(0, 5)}
            </span>
            <span className="tl-stage">
              <span className="stage-dot" style={{ background: TIMELINE_COLOR[t.stage] }} />
              {TIMELINE_LABEL[t.stage] ?? t.stage}
            </span>
            <span className="tl-mins">{formatDuration(Math.round(t.minutes))}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function StageBreakdown({ stages }) {
  const present = STAGE_META.filter(({ key }) => stages?.[key] > 0);
  if (present.length === 0) return null;
  const total = present.reduce((sum, { key }) => sum + stages[key], 0);
  return (
    <div className="stage-breakdown">
      <p className="stage-title">Sleep stages</p>
      <div className="stage-bar" role="img" aria-label="Sleep stage breakdown">
        {present.map(({ key, label, color }) => (
          <div
            key={key}
            className="stage-seg"
            style={{ width: `${(stages[key] / total) * 100}%`, background: color }}
            title={`${label}: ${formatDuration(stages[key])}`}
          />
        ))}
      </div>
      <div className="stage-legend">
        {present.map(({ key, label, color }) => (
          <span key={key} className="stage-chip">
            <span className="stage-dot" style={{ background: color }} />
            {label} {formatDuration(stages[key])}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ParsedSleepCard({ sleep, onConfirm, onReset }) {
  const [bedtime, setBedtime] = useState(sleep.bedtime ?? '');
  const [wakeTime, setWakeTime] = useState(sleep.wake_time ?? '');
  const [quality, setQuality] = useState(sleep.sleep_quality ?? '');

  const duration = computeDuration(bedtime, wakeTime) ?? sleep.duration_minutes;
  const ready = Boolean(bedtime && wakeTime);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Here’s what I read</h2>
        {sleep.confidence && (
          <span className={`badge badge-${sleep.confidence}`}>{sleep.confidence} confidence</span>
        )}
      </div>

      {sleep.source_app && (
        <p className="muted">
          {sleep.origin === 'health_export' ? (
            <>Imported from your <strong>Apple Health</strong> export — parsed on this device.</>
          ) : (
            <>Looks like a screenshot from <strong>{sleep.source_app}</strong>.</>
          )}
        </p>
      )}
      {sleep.notes &&
        (sleep.origin === 'health_export' ? (
          <p className="muted small">{sleep.notes}</p>
        ) : (
          <p className="notes">⚠️ {sleep.notes}</p>
        ))}

      <div className="field-grid">
        <label>
          Bedtime
          <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
        </label>
        <label>
          Wake time
          <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
        </label>
        <label>
          Duration
          <output>{formatDuration(duration)}</output>
        </label>
        <label>
          Quality <span className="optional">(optional)</span>
          <input
            type="text"
            value={quality}
            placeholder="e.g. 82/100, restless"
            onChange={(e) => setQuality(e.target.value)}
          />
        </label>
      </div>

      <StageBreakdown stages={sleep.stages} />
      <NightTimeline detail={sleep.detail} />

      <p className="muted small">Fix anything I misread — you know your night better than a screenshot does.</p>

      <div className="actions">
        <button className="btn-secondary" onClick={onReset}>Re-upload</button>
        <button
          className="btn-primary"
          disabled={!ready}
          onClick={() =>
            onConfirm({
              bedtime,
              wake_time: wakeTime,
              duration_minutes: duration,
              sleep_quality: quality.trim() || null,
              stages: sleep.stages ?? null,
              // Export imports carry the night's exact stage timeline — keep it
              // so schedule generation sees more than the screenshot-level summary.
              detail: sleep.detail ?? null,
            })
          }
        >
          Looks right — build my day
        </button>
      </div>
      {!ready && <p className="muted small">Enter a bedtime and wake time to continue.</p>}
    </div>
  );
}
