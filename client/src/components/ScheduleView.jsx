const CATEGORY_META = {
  deep_work: { label: 'Deep work', emoji: '🎯' },
  light_work: { label: 'Light work', emoji: '📋' },
  break: { label: 'Break', emoji: '☕' },
  meal: { label: 'Meal', emoji: '🍽️' },
  exercise: { label: 'Exercise', emoji: '🏃' },
  winddown: { label: 'Wind down', emoji: '🌙' },
};

export default function ScheduleView({ schedule, onReset }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Your day, built around you</h2>
        <span className="badge badge-flow">Circa Flow</span>
      </div>

      <p className="summary">{schedule.summary}</p>

      <ul className="schedule-list">
        {schedule.blocks.map((block, i) => {
          const meta = CATEGORY_META[block.category] ?? CATEGORY_META.light_work;
          return (
            <li key={i} className={`block block-${block.category}`}>
              <div className="block-time">
                {block.start}<span className="time-sep">–</span>{block.end}
              </div>
              <div className="block-body">
                <div className="block-title">
                  <span className="block-emoji">{meta.emoji}</span> {block.title}
                  <span className="chip">{meta.label}</span>
                </div>
                <p className="block-why">{block.why}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="actions">
        <button className="btn-secondary" onClick={onReset}>Start over with a new screenshot</button>
      </div>
    </div>
  );
}
