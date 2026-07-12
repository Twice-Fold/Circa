import { useEffect, useState } from 'react';
import { getTodos, putTodos } from '../api.js';
import { useAuth } from '../auth.jsx';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const PRIORITY_META = {
  high: { label: 'High', className: 'badge-prio-high' },
  medium: { label: 'Medium', className: 'badge-prio-medium' },
  low: { label: 'Low', className: 'badge-prio-low' },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  return mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function blankDraft() {
  return { name: '', minutes: 30, priority: '', deadline: '', recurring: false, notes: '' };
}

function TaskFields({ draft, onChange }) {
  const set = (patch) => onChange({ ...draft, ...patch });
  return (
    <>
      <input
        type="text"
        className="task-name-input"
        value={draft.name}
        placeholder="e.g. AP Calc problem set"
        aria-label="Task name"
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="task-form-row">
        <label className="task-field">
          Takes
          <select value={draft.minutes} onChange={(e) => set({ minutes: e.target.value })}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{formatMinutes(d)}</option>
            ))}
          </select>
        </label>
        <label className="task-field">
          Priority <span className="optional">(optional)</span>
          <select value={draft.priority} onChange={(e) => set({ priority: e.target.value })}>
            <option value="">None</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="task-field">
          Due by <span className="optional">(optional)</span>
          <input type="time" value={draft.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        </label>
        <label className="task-field task-field-check">
          Recurring
          <input
            type="checkbox"
            checked={draft.recurring}
            title="Comes back every day — never auto-completed"
            onChange={(e) => set({ recurring: e.target.checked })}
          />
        </label>
      </div>
      <input
        type="text"
        className="task-name-input task-notes-input"
        value={draft.notes}
        placeholder="Notes / context (optional) — e.g. chapter 4, needs the good headphones"
        aria-label="Task notes"
        onChange={(e) => set({ notes: e.target.value })}
      />
    </>
  );
}

export default function TodoList() {
  const { user } = useAuth();
  const [todos, setTodos] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [draft, setDraft] = useState(blankDraft());
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const list = await getTodos(token);
        if (!cancelled) {
          setTodos(list);
          setState('ready');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setState('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Whole-list save; on failure the previous state is restored so the UI
  // never silently diverges from what's stored.
  async function persist(next, previous) {
    setTodos(next);
    setSaveError(null);
    try {
      const token = await user.getIdToken();
      const saved = await putTodos(token, next);
      setTodos(saved);
    } catch (e) {
      setTodos(previous);
      setSaveError(`${e.message} — that change wasn’t saved.`);
    }
  }

  function draftToTask(d, base = {}) {
    return {
      id: base.id ?? crypto.randomUUID(),
      name: d.name.trim().slice(0, 120),
      minutes: Number(d.minutes),
      priority: d.priority || null,
      deadline: d.deadline || null,
      recurring: Boolean(d.recurring),
      notes: d.notes.trim() ? d.notes.trim().slice(0, 500) : null,
      completed: d.recurring ? false : (base.completed ?? false),
      scheduledFor: base.scheduledFor ?? null,
    };
  }

  function handleAdd(e) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    persist([...todos, draftToTask(draft)], todos);
    setDraft(blankDraft());
  }

  function toggleComplete(task) {
    persist(
      todos.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)),
      todos
    );
  }

  function remove(task) {
    persist(todos.filter((t) => t.id !== task.id), todos);
  }

  function startEdit(task) {
    setEditingId(task.id);
    setEditDraft({
      name: task.name,
      minutes: task.minutes,
      priority: task.priority ?? '',
      deadline: task.deadline ?? '',
      recurring: task.recurring,
      notes: task.notes ?? '',
    });
  }

  function saveEdit(task) {
    if (!editDraft.name.trim()) return;
    persist(
      todos.map((t) => (t.id === task.id ? draftToTask(editDraft, task) : t)),
      todos
    );
    setEditingId(null);
    setEditDraft(null);
  }

  const open = todos.filter((t) => !t.completed || t.recurring);
  const done = todos.filter((t) => t.completed && !t.recurring);

  function renderTask(task) {
    if (editingId === task.id) {
      return (
        <li key={task.id} className="task-item task-item-editing">
          <div className="task-body">
            <TaskFields draft={editDraft} onChange={setEditDraft} />
            <div className="task-edit-actions">
              <button className="btn-secondary small" onClick={() => { setEditingId(null); setEditDraft(null); }}>
                Cancel
              </button>
              <button className="btn-primary small" disabled={!editDraft.name.trim()} onClick={() => saveEdit(task)}>
                Save
              </button>
            </div>
          </div>
        </li>
      );
    }
    return (
      <li key={task.id} className={`task-item${task.completed ? ' task-done' : ''}`}>
        {task.recurring ? (
          <span className="task-recurring-mark" title="Recurring — never auto-completed" aria-hidden="true">🔁</span>
        ) : (
          <input
            type="checkbox"
            className="task-check"
            checked={task.completed}
            aria-label={`Mark ${task.name} ${task.completed ? 'not done' : 'done'}`}
            onChange={() => toggleComplete(task)}
          />
        )}
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
            {task.recurring && <span className="badge badge-recurring">Recurring</span>}
            {task.scheduledFor && !task.completed && (
              <span className="badge badge-scheduled">
                Scheduled for {task.scheduledFor === todayISO() ? 'today' : task.scheduledFor}
              </span>
            )}
          </span>
          {task.notes && <span className="task-notes muted">{task.notes}</span>}
        </div>
        <button type="button" className="link-btn" onClick={() => startEdit(task)}>edit</button>
        <button type="button" className="task-remove" aria-label={`Delete ${task.name}`} onClick={() => remove(task)}>
          ×
        </button>
      </li>
    );
  }

  return (
    <div className="app account-page">
      <h1 className="page-title">Circa To-Do List</h1>
      <p className="muted">
        Your ongoing list — Circa pulls open and recurring tasks into every schedule automatically.
        Stored encrypted; only you hold the key.
      </p>

      <section className="card">
        <form className="task-form" onSubmit={handleAdd}>
          <TaskFields draft={draft} onChange={setDraft} />
          <div className="task-edit-actions">
            <button className="btn-primary small" type="submit" disabled={!draft.name.trim()}>
              Add to list
            </button>
          </div>
        </form>

        {saveError && <p className="error-text">{saveError}</p>}

        {state === 'loading' ? (
          <div className="loading"><div className="spinner" /><p className="muted">Unlocking your list…</p></div>
        ) : state === 'error' ? (
          <div className="empty-state">
            <div className="empty-emoji" aria-hidden="true">📡</div>
            <p className="muted">{error}</p>
          </div>
        ) : open.length === 0 && done.length === 0 ? (
          <p className="task-empty muted">Nothing here yet — add your first task above.</p>
        ) : (
          <>
            <ul className="task-list">{open.map(renderTask)}</ul>
            {done.length > 0 && (
              <details className="done-tasks">
                <summary>Completed ({done.length})</summary>
                <ul className="task-list">{done.map(renderTask)}</ul>
              </details>
            )}
          </>
        )}
      </section>

      <p className="center-note">
        <a className="link-btn" href="#/routines">Manage your Routines →</a>
      </p>
    </div>
  );
}
