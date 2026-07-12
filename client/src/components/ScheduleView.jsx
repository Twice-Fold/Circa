const CATEGORY_META = {
  deep_work: { label: 'Deep work', emoji: '🎯' },
  light_work: { label: 'Light work', emoji: '📋' },
  break: { label: 'Break', emoji: '☕' },
  meal: { label: 'Meal', emoji: '🍽️' },
  exercise: { label: 'Exercise', emoji: '🏃' },
  winddown: { label: 'Wind down', emoji: '🌙' },
};

const MODE_BADGE = {
  nyx: { className: 'badge-nyx-mode', label: '🌠 Circa Nyx' },
  flow: { className: 'badge-flow-mode', label: '⚡ Circa Flow' },
  rhythm: { className: 'badge-rhythm-mode', label: '🌊 Circa Rhythm' },
};

export default function ScheduleView({ schedule, mode = 'nyx', onReset, resetLabel = 'Start over with a new screenshot' }) {
  const badge = MODE_BADGE[mode] ?? MODE_BADGE.nyx;
  return (
    <div className="card">
      <div className="card-header">
        <h2>Your day, built around you</h2>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
      </div>

      <p className="summary">{schedule.summary}</p>

      <ul className="schedule-list">
        {schedule.blocks.map((block, i) => {
          const meta = CATEGORY_META[block.category] ?? CATEGORY_META.light_work;
          return (
            <li
              key={i}
              className={`block block-${block.category}${block.task ? ' block-your-task' : ''}${block.routine ? ' block-anchor' : ''}`}
            >
              <div className="block-time">
                {block.start}<span className="time-sep">–</span>{block.end}
              </div>
              <div className="block-body">
                <div className="block-title">
                  <span className="block-emoji">{meta.emoji}</span> {block.title}
                  <span className="chip">{meta.label}</span>
                  {block.routine && <span className="chip chip-routine">🔒 Routine</span>}
                  {block.task && <span className="chip chip-task">📌 Your task</span>}
                </div>
                <p className="block-why">{block.why}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="actions">
        <button className="btn-secondary" onClick={onReset}>{resetLabel}</button>
      </div>
    </div>
  );
}
