import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import ChatFlow from '../components/ChatFlow.jsx';
import UploadZone from '../components/UploadZone.jsx';
import HealthExportZone from '../components/HealthExportZone.jsx';
import ParsedSleepCard from '../components/ParsedSleepCard.jsx';
import TaskPlanner from '../components/TaskPlanner.jsx';
import ModePicker from '../components/ModePicker.jsx';
import ScheduleView from '../components/ScheduleView.jsx';
import PrivacyNote from '../components/PrivacyNote.jsx';
import { fileToDataUrl, parseScreenshot, getTodos, getRoutines } from '../api.js';
import { mergeSleepResults } from '../lib/mergeSleep.js';
import { parseHealthExport } from '../lib/parseHealthExport.js';
import { auth, db } from '../firebase.js';
import { useAuth } from '../auth.jsx';
import { useGeneration } from '../generation.jsx';

export default function SchedulerApp() {
  const { user } = useAuth();
  // Generation itself lives at the app level (survives navigation); this
  // page just drives the input steps and mirrors the run's state.
  const { generation, start, stop, clear } = useGeneration();
  const [step, setStep] = useState('chat'); // chat | upload | parsing | confirm | tasks | mode | scheduling | schedule
  const [sleep, setSleep] = useState(null);
  const [tasks, setTasks] = useState([]); // one-off tasks for today only (not persisted)
  const [persistentTodos, setPersistentTodos] = useState([]); // full To-Do List from Greg
  const [routines, setRoutines] = useState([]); // full Routines list from Greg
  const [mode, setMode] = useState('nyx'); // fastest tier is the default
  const [error, setError] = useState(null);
  const [batchSize, setBatchSize] = useState(1);
  const [exportLabel, setExportLabel] = useState(null); // progress copy while parsing a Health export locally

  // The persistent To-Do List and Routines ride along into every generation
  // automatically. Failures here are non-fatal — the day just builds without them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const [todos, routineList] = await Promise.all([
          getTodos(token).catch(() => []),
          getRoutines(token).catch(() => []),
        ]);
        if (!cancelled) {
          setPersistentTodos(todos);
          setRoutines(routineList);
        }
      } catch {
        // signed-out edge or storage down — proceed without persisted lists
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Pre-select the default mode from Settings; per-session override is free.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pref = (await getDoc(doc(db, 'users', user.uid))).data()?.defaultMode;
        if (!cancelled && ['nyx', 'flow', 'rhythm'].includes(pref)) setMode(pref);
      } catch {
        // no preference readable — Nyx default stands
      }
    })();
    return () => { cancelled = true; };
  }, [user.uid]);

  function reset() {
    clear();
    setStep('chat');
    setSleep(null);
    setTasks([]);
    setError(null);
  }

  // Mirror the app-level run into this page's step machine — including on
  // mount, so returning mid-run (or via the "ready" banner) lands correctly.
  useEffect(() => {
    if (generation.status === 'running') {
      setStep('scheduling');
    } else if (generation.status === 'done') {
      setStep('schedule');
    } else if (generation.status === 'error') {
      setError(generation.error);
      setStep('mode');
      clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation.status]);

  function handleChatReady(chatSleep) {
    setError(null);
    setSleep(chatSleep);
    setStep('confirm');
  }

  async function handleFiles(files) {
    setError(null);
    setBatchSize(files.length);
    setStep('parsing');
    try {
      const dataUrls = await Promise.all(files.map(fileToDataUrl));
      const settled = await Promise.allSettled(dataUrls.map(parseScreenshot));
      const parsed = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);

      if (parsed.length === 0) {
        const reason = settled[0].reason?.message ?? 'Could not read those screenshots.';
        throw new Error(files.length === 1 ? reason : `None of the screenshots could be read — ${reason}`);
      }
      if (parsed.length < settled.length) {
        setError(
          `${settled.length - parsed.length} of ${settled.length} screenshots couldn’t be read — here’s what the rest showed.`
        );
      }

      setSleep(mergeSleepResults(parsed));
      setStep('confirm');
    } catch (e) {
      setError(e.message);
      setStep('upload');
    }
  }

  async function handleExportFile(file) {
    setError(null);
    setExportLabel('Opening your Apple Health export…');
    setStep('parsing');
    try {
      const sleep = await parseHealthExport(file, setExportLabel);
      setSleep(sleep);
      setStep('confirm');
    } catch (e) {
      setError(e.message);
      setStep('upload');
    } finally {
      setExportLabel(null);
    }
  }

  function handleConfirm(confirmedSleep) {
    setError(null);
    setSleep(confirmedSleep);
    setStep('tasks');
  }

  // Open + recurring tasks from the To-Do List join today's one-offs; the
  // model treats the combined list as a menu and fits what makes sense.
  function tasksForToday() {
    const fromList = persistentTodos
      .filter((t) => !t.completed || t.recurring)
      .map(({ name, minutes, priority, deadline, notes }) => ({ name, minutes, priority, deadline, notes }));
    return [...tasks, ...fromList];
  }

  function routinesForToday() {
    const today = new Date().getDay();
    return routines
      .filter((r) => r.days?.includes(today))
      .map(({ name, start, end, fixed }) => ({ name, start, end, fixed }));
  }

  async function handleGenerate() {
    setError(null);
    setStep('scheduling');
    try {
      await start(sleep, mode, tasksForToday(), routinesForToday());
    } catch (e) {
      setError(e.message);
      setStep('mode');
    }
  }

  function handleStop() {
    stop();
    setStep('mode');
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      window.location.hash = '#/';
    } catch {
      setError('Could not sign out — please try again.');
    }
  }

  // The direct uploader is a stripped-down utility screen; branding lives everywhere else.
  const utilityScreen = step === 'upload' || step === 'parsing';

  return (
    <div className={`app${step === 'chat' ? ' app-chat' : ''}`}>
      <div className="account-bar">
        <span className="muted small">
          Signed in as <strong>{user?.email ?? user?.displayName ?? 'your account'}</strong>
        </span>
        <button className="btn-secondary small" onClick={handleSignOut}>Sign Out</button>
      </div>

      {utilityScreen ? (
        <header className="utility-header">
          <h1 className="utility-title">Schedule Image Uploader</h1>
          <p className="muted small">Screenshots in, sleep data out.</p>
        </header>
      ) : (
        <header>
          <div className="logo-heart" aria-hidden="true">♥</div>
          <h1>Circa</h1>
          <p className="tagline">A schedule that knows you — built around your actual biology.</p>
        </header>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="btn-secondary small" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {step === 'chat' && <ChatFlow onReady={handleChatReady} onBail={() => setStep('upload')} />}

      {step === 'upload' && (
        <>
          <UploadZone onFiles={handleFiles} />
          <div className="divider"><span>or</span></div>
          <HealthExportZone onFile={handleExportFile} />
          <p className="center-note">
            <button className="link-btn" onClick={() => setStep('chat')}>
              Prefer a guided walkthrough? Chat with Circa Sol instead
            </button>
          </p>
        </>
      )}

      {step === 'parsing' && (
        <div className="loading card">
          <div className="spinner" />
          <p>{exportLabel ?? (batchSize > 1 ? `Reading your ${batchSize} screenshots…` : 'Reading your sleep data…')}</p>
          {exportLabel && (
            <p className="muted small">Parsed right here in your browser — the file never leaves your device.</p>
          )}
        </div>
      )}

      {step === 'confirm' && sleep && (
        <ParsedSleepCard sleep={sleep} onConfirm={handleConfirm} onReset={reset} />
      )}

      {step === 'tasks' && (
        <TaskPlanner
          tasks={tasks}
          listCount={persistentTodos.filter((t) => !t.completed || t.recurring).length}
          routineCount={routinesForToday().length}
          onChange={setTasks}
          onContinue={() => setStep('mode')}
          onBack={() => setStep('confirm')}
        />
      )}

      {step === 'mode' && (
        <ModePicker
          mode={mode}
          onSelect={setMode}
          onGenerate={handleGenerate}
          onBack={() => setStep('tasks')}
        />
      )}

      {step === 'scheduling' && (
        <div className="loading card">
          <div className="spinner" />
          <p>
            {mode === 'rhythm'
              ? 'Circa Rhythm is thinking it through…'
              : mode === 'flow'
                ? 'Circa Flow is building your day…'
                : 'Circa Nyx is sketching your day…'}
          </p>
          <p className="muted small">
            {mode === 'rhythm'
              ? 'Our deepest reasoning takes a minute or two — worth it for a complex day.'
              : mode === 'flow'
                ? 'Balanced reasoning — usually under a minute.'
                : "Reading your energy curve from last night's sleep."}
          </p>
        </div>
      )}

      {step === 'schedule' && schedule && <ScheduleView schedule={schedule} mode={mode} onReset={reset} />}

      <PrivacyNote />
    </div>
  );
}
