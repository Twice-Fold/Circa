// Speed order, fastest first — Nyx is the default.
const MODES = [
  {
    id: 'nyx',
    badge: '🌠 Circa Nyx',
    badgeClass: 'mode-badge-nyx',
    description: 'Fast, sharp scheduling — ready in seconds.',
  },
  {
    id: 'flow',
    badge: '⚡ Circa Flow',
    badgeClass: 'mode-badge-flow',
    description: 'Balanced reasoning — a bit more thorough, a bit more wait.',
  },
  {
    id: 'rhythm',
    badge: '🌊 Circa Rhythm',
    badgeClass: 'mode-badge-rhythm',
    description: 'Our most thorough reasoning — worth the wait for complex days.',
  },
];

export default function ModePicker({ mode, onSelect, onGenerate, onBack }) {
  return (
    <div className="card">
      <h2>How should Circa think today?</h2>
      <p className="muted small">Your data’s confirmed — pick a mode and build your day.</p>

      <div className="mode-grid" role="radiogroup" aria-label="Schedule mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mode-card${mode === m.id ? ' selected' : ''}`}
            aria-pressed={mode === m.id}
            onClick={() => onSelect(m.id)}
          >
            <span className={`mode-badge ${m.badgeClass}`}>{m.badge}</span>
            <p>{m.description}</p>
          </button>
        ))}
      </div>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={onGenerate}>Build my day</button>
      </div>
    </div>
  );
}
