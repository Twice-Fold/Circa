import { useState } from 'react';
import { getDebugInfo } from '../api.js';
import { useAuth } from '../auth.jsx';

// Dev-only console. The server enforces the account gate (anyone else gets a
// 404); this check just keeps the panel out of everyone else's DOM.
const DEBUG_EMAIL = 'mythresh.naveen@gmail.com';

export default function DebugConsole() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);

  if (user?.email !== DEBUG_EMAIL) return null;

  async function refresh() {
    setState('loading');
    try {
      const token = await user.getIdToken();
      setInfo(await getDebugInfo(token));
      setState('ready');
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  }

  return (
    <details className="debug-console" onToggle={(e) => e.target.open && state === 'idle' && refresh()}>
      <summary>🛠 Debug console</summary>
      <div className="debug-body">
        <button className="btn-secondary small" onClick={refresh} disabled={state === 'loading'}>
          {state === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
        {state === 'error' && <p className="error-text">Couldn’t load debug info: {error}</p>}
        {state === 'ready' && !info && <p className="muted small">No generation recorded yet this server session.</p>}
        {state === 'ready' && info && (
          <dl className="debug-grid">
            <dt>When</dt><dd>{info.at}</dd>
            <dt>Mode</dt><dd>{info.mode}</dd>
            <dt>Model</dt><dd>{info.model}</dd>
            <dt>Status</dt><dd>{info.status}</dd>
            <dt>Response time</dt><dd>{(info.duration_ms / 1000).toFixed(1)}s</dd>
            <dt>Params</dt>
            <dd>
              temp {info.request.temperature} · max_tokens {info.request.max_tokens} · timeout{' '}
              {info.request.timeout_ms / 1000}s
              {info.request.extra && Object.keys(info.request.extra).length > 0 && (
                <> · extra <code>{JSON.stringify(info.request.extra)}</code></>
              )}
            </dd>
            <dt>Prompt size</dt>
            <dd>
              system {info.request.system_prompt_chars} chars · user {info.request.user_message_chars} chars
            </dd>
            {info.error && (
              <>
                <dt>Error</dt>
                <dd className="error-text">[{info.error.code}] {info.error.message}</dd>
              </>
            )}
          </dl>
        )}
        {state === 'ready' && info && (
          <details className="debug-prompt">
            <summary>User message sent to the model</summary>
            <pre>{info.request.user_message}</pre>
          </details>
        )}
      </div>
    </details>
  );
}
