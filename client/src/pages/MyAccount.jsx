import { useEffect, useState } from 'react';
import ScheduleView from '../components/ScheduleView.jsx';
import { getHistory } from '../api.js';
import { useAuth } from '../auth.jsx';

const MODE_LABEL = { nyx: 'Nyx', flow: 'Flow', rhythm: 'Rhythm' };

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function MyAccount() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0];

  // Past schedules, decrypted from Greg via the key-split backend.
  const [pastSchedules, setPastSchedules] = useState([]);
  const [historyState, setHistoryState] = useState('loading'); // loading | ready | error
  const [historyError, setHistoryError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const schedules = await getHistory(token);
        if (!cancelled) {
          setPastSchedules(schedules);
          setHistoryState('ready');
        }
      } catch (e) {
        if (!cancelled) {
          setHistoryError(e.message);
          setHistoryState('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="app account-page">
      <h1 className="page-title">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>

      <a className="chat-cta" href="#/app">
        <div className="chat-cta-heart" aria-hidden="true">♥</div>
        <div className="chat-cta-body">
          <span className="chat-cta-title">Chat with Circa Sol</span>
          <span className="chat-cta-sub">Tell Circa Sol about last night and get a day built around your energy.</span>
        </div>
        <span className="chat-cta-arrow" aria-hidden="true">→</span>
      </a>

      <div className="planning-links">
        <a className="planning-link" href="#/todos">
          <span className="planning-emoji" aria-hidden="true">📝</span>
          <span className="planning-title">Circa To-Do List</span>
          <span className="planning-sub muted">Ongoing tasks, pulled into every schedule</span>
        </a>
        <a className="planning-link" href="#/routines">
          <span className="planning-emoji" aria-hidden="true">⏰</span>
          <span className="planning-title">Routines</span>
          <span className="planning-sub muted">Fixed anchors your day is built around</span>
        </a>
      </div>

      <section className="card">
        <h2 className="section-title">Past Schedules</h2>
        {selected ? (
          <ScheduleView
            schedule={selected.schedule}
            mode={selected.mode}
            onReset={() => setSelected(null)}
            resetLabel="← Back to list"
          />
        ) : historyState === 'loading' ? (
          <div className="loading">
            <div className="spinner" />
            <p className="muted">Unlocking your schedules…</p>
          </div>
        ) : historyState === 'error' ? (
          <div className="empty-state">
            <div className="empty-emoji" aria-hidden="true">📡</div>
            <p className="muted">{historyError}</p>
            <p className="muted small">Your history lives on encrypted storage — it’ll be back when the connection is.</p>
          </div>
        ) : pastSchedules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-emoji" aria-hidden="true">🌙</div>
            <p className="muted">No schedules yet — start your first chat with Circa Sol.</p>
            <a className="btn-primary as-link" href="#/app">Chat with Circa Sol</a>
          </div>
        ) : (
          <ul className="past-list">
            {pastSchedules.map((item) => (
              <li key={item.id}>
                <button className="past-item" onClick={() => setSelected(item)}>
                  <span className="past-date">{formatDate(item.created_at)}</span>
                  <span className={`badge badge-${item.mode ?? 'flow'}-mode`}>
                    {MODE_LABEL[item.mode] ?? 'Flow'}
                  </span>
                  <span className="past-summary muted">{item.schedule.summary}</span>
                  <span className="past-chevron" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
