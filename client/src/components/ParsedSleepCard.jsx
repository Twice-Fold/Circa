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
        <span className={`badge badge-${sleep.confidence}`}>{sleep.confidence} confidence</span>
      </div>

      {sleep.source_app && <p className="muted">Looks like a screenshot from <strong>{sleep.source_app}</strong>.</p>}
      {sleep.notes && <p className="notes">⚠️ {sleep.notes}</p>}

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
