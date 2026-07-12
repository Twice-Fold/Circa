import { useState } from 'react';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const PRIORITY_META = {
  high: { label: 'High', className: 'badge-prio-high' },
  medium: { label: 'Medium', className: 'badge-prio-medium' },
  low: { label: 'Low', className: 'badge-prio-low' },
};

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  return mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// One-off tasks for today only. The persistent To-Do List and Routines are
// pulled into generation automatically — this step is for extras.
export default function TaskPlanner({ tasks, listCount = 0, routineCount = 0, onChange, onContinue, onBack }) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [priority, setPriority] = useState('');
  const [deadline, setDeadline] = useState('');

  function addTask(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([
      ...tasks,
      {
        id: crypto.randomUUID(),
        name: trimmed.slice(0, 120),
        minutes: Number(minutes),
        priority: priority || null,
        deadline: deadline || null,
      },
    ]);
    setName('');
    setPriority('');
    setDeadline('');
  }

  function removeTask(id) {
    onChange(tasks.filter((t) => t.id !== id));
  }

  function moveTask(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= tasks.length) return;
    const next = [...tasks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="card">
      <h2>Anything extra today?</h2>
      <p className="muted small">
        {listCount > 0 || routineCount > 0 ? (
          <>
            {listCount > 0 && <><strong>{listCount}</strong> task{listCount === 1 ? '' : 's'} from your <a href="#/todos">To-Do List</a></>}
            {listCount > 0 && routineCount > 0 && ' and '}
            {routineCount > 0 && <><strong>{routineCount}</strong> routine{routineCount === 1 ? '' : 's'}</>}
            {' '}come along automatically. Add one-off tasks for today below — they aren’t saved to your list.
          </>
        ) : (
          'Add one-off tasks for today — or skip straight ahead with just your sleep.'
        )}
      </p>

      <form className="task-form" onSubmit={addTask}>
        <input
          type="text"
          className="task-name-input"
          value={name}
          placeholder="e.g. Finish the pitch deck"
          aria-label="Task name"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="task-form-row">
          <label className="task-field">
            Takes
            <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{formatMinutes(d)}</option>
              ))}
            </select>
          </label>
          <label className="task-field">
            Priority <span className="optional">(optional)</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">None</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="task-field">
            Due by <span className="optional">(optional)</span>
            <input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <button className="btn-primary small task-add" type="submit" disabled={!name.trim()}>
            Add task
          </button>
        </div>
      </form>

      {tasks.length > 0 ? (
        <ul className="task-list">
          {tasks.map((task, i) => (
            <li key={task.id} className="task-item">
              <div className="task-reorder">
                <button
                  type="button"
                  disabled={i === 0}
                  aria-label={`Move ${task.name} up`}
                  onClick={() => moveTask(i, -1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={i === tasks.length - 1}
                  aria-label={`Move ${task.name} down`}
                  onClick={() => moveTask(i, 1)}
                >
                  ▼
                </button>
              </div>
              <div className="task-body">
                <span className="task-title">{task.name}</span>
                <span className="task-meta">
                  <span className="chip">{formatMinutes(task.minutes)}</span>
                  {task.priority && (
                    <span className={`badge ${PRIORITY_META[task.priority].className}`}>
                      {PRIORITY_META[task.priority].label}
                    </span>
                  )}
                  {task.deadline && <span className="task-deadline">by {task.deadline}</span>}
                </span>
              </div>
              <button
                type="button"
                className="task-remove"
                aria-label={`Remove ${task.name}`}
                onClick={() => removeTask(task.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="task-empty muted">No extras — your day, your call.</p>
      )}

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={onContinue}>
          {tasks.length > 0
            ? `Continue with ${tasks.length} extra${tasks.length === 1 ? '' : 's'}`
            : listCount > 0 || routineCount > 0
              ? 'Continue'
              : 'Skip — just my sleep'}
        </button>
      </div>
    </div>
  );
}
