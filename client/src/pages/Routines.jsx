import { useEffect, useState } from 'react';
import { getRoutines, putRoutines } from '../api.js';
import { useAuth } from '../auth.jsx';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function describeDays(days) {
  const set = new Set(days);
  if (ALL_DAYS.every((d) => set.has(d))) return 'Daily';
  if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) return 'Weekdays';
  return [...days].sort().map((d) => DAY_LABELS[d]).join(' · ');
}

function blankDraft() {
  return { name: '', start: '', end: '', preset: 'daily', days: ALL_DAYS, fixed: true };
}

function RoutineFields({ draft, onChange }) {
  const set = (patch) => onChange({ ...draft, ...patch });
  const setPreset = (preset) => {
    if (preset === 'daily') set({ preset, days: ALL_DAYS });
    else if (preset === 'weekdays') set({ preset, days: WEEKDAYS });
    else set({ preset, days: draft.days });
  };
  const toggleDay = (d) =>
    set({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d] });

  return (
    <>
      <input
        type="text"
        className="task-name-input"
        value={draft.name}
        placeholder="e.g. School bus"
        aria-label="Routine name"
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="task-form-row">
        <label className="task-field">
          Starts
          <input type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} />
        </label>
        <label className="task-field">
          Ends <span className="optional">(optional)</span>
          <input type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} />
        </label>
        <label className="task-field">
          Days
          <select value={draft.preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        <label className="task-field task-field-check">
          Fixed
          <input
            type="checkbox"
            checked={draft.fixed}
            title="Non-negotiable — the schedule may never move it"
            onChange={(e) => set({ fixed: e.target.checked })}
          />
        </label>
      </div>
      {draft.preset === 'custom' && (
        <div className="day-picker">
          {DAY_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              className={`day-chip${draft.days.includes(d) ? ' selected' : ''}`}
              aria-pressed={draft.days.includes(d)}
              onClick={() => toggleDay(d)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function Routines() {
  const { user } = useAuth();
  const [routines, setRoutines] = useState([]);
  const [state, setState] = useState('loading');
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
        const list = await getRoutines(token);
        if (!cancelled) {
          setRoutines(list);
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

  async function persist(next, previous) {
    setRoutines(next);
    setSaveError(null);
    try {
      const token = await user.getIdToken();
      const saved = await putRoutines(token, next);
      setRoutines(saved);
    } catch (e) {
      setRoutines(previous);
      setSaveError(`${e.message} — that change wasn’t saved.`);
    }
  }

  const valid = (d) => d.name.trim() && d.start && d.days.length > 0;

  function draftToRoutine(d, base = {}) {
    return {
      id: base.id ?? crypto.randomUUID(),
      name: d.name.trim().slice(0, 120),
      start: d.start,
      end: d.end || null,
      days: [...d.days].sort(),
      fixed: Boolean(d.fixed),
    };
  }

  function handleAdd(e) {
    e.preventDefault();
    if (!valid(draft)) return;
    persist([...routines, draftToRoutine(draft)], routines);
    setDraft(blankDraft());
  }

  function startEdit(routine) {
    setEditingId(routine.id);
    const set = new Set(routine.days);
    const preset = ALL_DAYS.every((d) => set.has(d))
      ? 'daily'
      : routine.days.length === 5 && WEEKDAYS.every((d) => set.has(d))
        ? 'weekdays'
        : 'custom';
    setEditDraft({ name: routine.name, start: routine.start, end: routine.end ?? '', preset, days: routine.days, fixed: routine.fixed });
  }

  function saveEdit(routine) {
    if (!valid(editDraft)) return;
    persist(routines.map((r) => (r.id === routine.id ? draftToRoutine(editDraft, routine) : r)), routines);
    setEditingId(null);
    setEditDraft(null);
  }

  return (
    <div className="app account-page">
      <h1 className="page-title">Routines</h1>
      <p className="muted">
        The fixed shape of your days — bus times, classes, standing commitments. Circa anchors every
        schedule around these automatically on the days they apply.
      </p>

      <section className="card">
        <form className="task-form" onSubmit={handleAdd}>
          <RoutineFields draft={draft} onChange={setDraft} />
          <div className="task-edit-actions">
            <button className="btn-primary small" type="submit" disabled={!valid(draft)}>
              Add routine
            </button>
          </div>
        </form>

        {saveError && <p className="error-text">{saveError}</p>}

        {state === 'loading' ? (
          <div className="loading"><div className="spinner" /><p className="muted">Unlocking your routines…</p></div>
        ) : state === 'error' ? (
          <div className="empty-state">
            <div className="empty-emoji" aria-hidden="true">📡</div>
            <p className="muted">{error}</p>
          </div>
        ) : routines.length === 0 ? (
          <p className="task-empty muted">No routines yet — add the fixed parts of your day above.</p>
        ) : (
          <ul className="task-list">
            {routines.map((routine) =>
              editingId === routine.id ? (
                <li key={routine.id} className="task-item task-item-editing">
                  <div className="task-body">
                    <RoutineFields draft={editDraft} onChange={setEditDraft} />
                    <div className="task-edit-actions">
                      <button className="btn-secondary small" onClick={() => { setEditingId(null); setEditDraft(null); }}>
                        Cancel
                      </button>
                      <button className="btn-primary small" disabled={!valid(editDraft)} onClick={() => saveEdit(routine)}>
                        Save
                      </button>
                    </div>
                  </div>
                </li>
              ) : (
                <li key={routine.id} className="task-item">
                  <span className="task-recurring-mark" aria-hidden="true">{routine.fixed ? '🔒' : '🕰️'}</span>
                  <div className="task-body">
                    <span className="task-title">{routine.name}</span>
                    <span className="task-meta">
                      <span className="chip">
                        {routine.start}{routine.end ? `–${routine.end}` : ''}
                      </span>
                      <span className="badge badge-days">{describeDays(routine.days)}</span>
                      {routine.fixed && <span className="badge badge-fixed">Fixed</span>}
                    </span>
                  </div>
                  <button type="button" className="link-btn" onClick={() => startEdit(routine)}>edit</button>
                  <button type="button" className="task-remove" aria-label={`Delete ${routine.name}`} onClick={() => persist(routines.filter((r) => r.id !== routine.id), routines)}>
                    ×
                  </button>
                </li>
              )
            )}
          </ul>
        )}
      </section>

      <p className="center-note">
        <a className="link-btn" href="#/todos">← Back to your To-Do List</a>
      </p>
    </div>
  );
}
