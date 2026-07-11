import { useState } from 'react';
import UploadZone from './components/UploadZone.jsx';
import ParsedSleepCard from './components/ParsedSleepCard.jsx';
import ScheduleView from './components/ScheduleView.jsx';
import PrivacyNote from './components/PrivacyNote.jsx';
import { fileToDataUrl, parseScreenshot, generateSchedule } from './api.js';

export default function App() {
  const [step, setStep] = useState('upload'); // upload | parsing | confirm | scheduling | schedule
  const [sleep, setSleep] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState(null);

  function reset() {
    setStep('upload');
    setSleep(null);
    setSchedule(null);
    setError(null);
  }

  async function handleFile(file) {
    setError(null);
    setStep('parsing');
    try {
      const dataUrl = await fileToDataUrl(file);
      const parsed = await parseScreenshot(dataUrl);
      setSleep(parsed);
      setStep('confirm');
    } catch (e) {
      setError(e.message);
      setStep('upload');
    }
  }

  async function handleConfirm(confirmedSleep) {
    setError(null);
    setSleep(confirmedSleep);
    setStep('scheduling');
    try {
      const result = await generateSchedule(confirmedSleep);
      setSchedule(result);
      setStep('schedule');
    } catch (e) {
      setError(e.message);
      setStep('confirm');
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Circa</h1>
        <p className="tagline">A schedule that knows you — built around your actual biology.</p>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="btn-secondary small" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {step === 'upload' && <UploadZone onFile={handleFile} />}

      {step === 'parsing' && (
        <div className="loading card">
          <div className="spinner" />
          <p>Reading your sleep data…</p>
        </div>
      )}

      {step === 'confirm' && sleep && (
        <ParsedSleepCard sleep={sleep} onConfirm={handleConfirm} onReset={reset} />
      )}

      {step === 'scheduling' && (
        <div className="loading card">
          <div className="spinner" />
          <p>Circa Flow is building your day…</p>
          <p className="muted small">Reading your energy curve from last night's sleep.</p>
        </div>
      )}

      {step === 'schedule' && schedule && <ScheduleView schedule={schedule} onReset={reset} />}

      <PrivacyNote />
    </div>
  );
}
