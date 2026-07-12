import { useEffect, useState } from 'react';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { useAuth } from '../auth.jsx';

function initials(user) {
  const source = user?.displayName || user?.email || '';
  const parts = source.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  return (((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()) || '?';
}

export default function Settings() {
  const { user } = useAuth();

  // Profile
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [nameStatus, setNameStatus] = useState(null); // 'saving' | 'saved' | 'error'

  // Preferences
  const [mode, setMode] = useState('nyx');
  const [modeStatus, setModeStatus] = useState('loading'); // 'loading' | 'ready' | 'saving' | 'error'

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled) {
          setMode(snap.data()?.defaultMode ?? 'nyx');
          setModeStatus('ready');
        }
      } catch {
        if (!cancelled) setModeStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [user.uid]);

  async function saveName(e) {
    e.preventDefault();
    setNameStatus('saving');
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      setNameStatus('saved');
      setTimeout(() => setNameStatus(null), 2500);
    } catch {
      setNameStatus('error');
    }
  }

  async function saveMode(next) {
    const previous = mode;
    setMode(next);
    setModeStatus('saving');
    try {
      await setDoc(doc(db, 'users', user.uid), { defaultMode: next }, { merge: true });
      setModeStatus('ready');
    } catch {
      setMode(previous);
      setModeStatus('error');
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    window.location.hash = '#/';
  }

  return (
    <div className="app account-page">
      <h1 className="page-title">Settings</h1>

      {/* Profile */}
      <section className="card">
        <div className="profile-row">
          <div className="avatar" aria-hidden="true">{initials(user)}</div>
          <div className="profile-fields">
            <form className="name-form" onSubmit={saveName}>
              <label>
                Display name
                <div className="name-input-row">
                  <input
                    type="text"
                    value={displayName}
                    placeholder="How should Circa greet you?"
                    onChange={(e) => { setDisplayName(e.target.value); setNameStatus(null); }}
                  />
                  <button
                    className="btn-primary small"
                    type="submit"
                    disabled={nameStatus === 'saving' || displayName.trim() === (user?.displayName ?? '')}
                  >
                    {nameStatus === 'saving' ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </label>
              {nameStatus === 'saved' && <p className="status-ok">Saved.</p>}
              {nameStatus === 'error' && <p className="error-text">Couldn’t save your name — try again.</p>}
            </form>
            <label className="email-field">
              Email
              <output>{user?.email ?? '—'}</output>
            </label>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="card">
        <h2 className="section-title">Preferences</h2>
        <div className="pref-row">
          <div>
            <p className="pref-label">Default mode</p>
            <p className="muted small">
              Nyx is the fastest. Flow reasons a bit more. Rhythm thinks the longest and deepest.
              You can still switch modes each time you build a schedule.
            </p>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Default mode">
            {[['nyx', 'Circa Nyx'], ['flow', 'Circa Flow'], ['rhythm', 'Circa Rhythm']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={mode === id ? 'active' : ''}
                aria-pressed={mode === id}
                disabled={modeStatus === 'loading' || modeStatus === 'saving'}
                onClick={() => mode !== id && saveMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {modeStatus === 'error' && (
          <p className="error-text">Couldn’t reach your preferences — the toggle wasn’t saved.</p>
        )}
      </section>

      {/* Privacy & Data */}
      <section className="card">
        <h2 className="section-title">Privacy &amp; Data</h2>
        <p className="muted">
          Your raw sleep data is processed locally and never leaves your control — only anonymized
          signals (bedtime, wake time, duration, quality, sleep stages) ever reach the AI. No
          screenshots, no identity, no account details.
        </p>
        <div className="actions privacy-actions">
          <button className="btn-danger" disabled title="Available once schedule storage lands">
            Delete My Data
          </button>
          <button className="btn-secondary" onClick={handleSignOut}>Sign Out</button>
        </div>
        <p className="muted small">
          Delete My Data will be enabled once schedule storage is live — there’s nothing stored to delete yet.
        </p>
      </section>
    </div>
  );
}
