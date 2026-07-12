import { useGeneration } from '../generation.jsx';

/**
 * App-wide status strip for a schedule run happening on another page. On the
 * scheduler page itself the full-size UI takes over, so this stays hidden.
 */
export default function GenerationBanner({ route }) {
  const { generation, clear } = useGeneration();
  if (route === '/app' || generation.status === 'idle') return null;

  if (generation.status === 'running') {
    return (
      <div className="gen-banner gen-banner-running" role="status">
        <span className="gen-banner-spinner" aria-hidden="true" />
        <span>Your schedule is still generating — browse freely, it&rsquo;ll keep going.</span>
        <a className="gen-banner-link" href="#/app">View progress</a>
      </div>
    );
  }

  if (generation.status === 'done') {
    return (
      <div className="gen-banner gen-banner-done" role="status">
        <span aria-hidden="true">✨</span>
        <span>Your schedule is ready.</span>
        <a className="gen-banner-link" href="#/app">View it</a>
        <button className="gen-banner-dismiss" aria-label="Dismiss" onClick={clear}>×</button>
      </div>
    );
  }

  // error
  return (
    <div className="gen-banner gen-banner-error" role="alert">
      <span aria-hidden="true">⚠️</span>
      <span>Schedule generation failed: {generation.error}</span>
      <button className="gen-banner-dismiss" aria-label="Dismiss" onClick={clear}>×</button>
    </div>
  );
}
