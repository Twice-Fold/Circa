import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { startSchedule, pollScheduleJob, cancelScheduleJob, getTodos, putTodos } from './api.js';
import { auth } from './firebase.js';

/**
 * App-level schedule generation. The job lives here — not in any page — so
 * navigating to Past Schedules, the To-Do List, or anywhere else never
 * interrupts a run. Pages read the state; a banner announces completion
 * wherever the user happens to be.
 */

const PENDING_JOB_KEY = 'circa-pending-schedule';

const GenerationContext = createContext(null);

// Non-recurring To-Do tasks that made the schedule get tagged "scheduled for
// today". Lives here (not in the scheduler page) so it runs even if the user
// wandered off mid-generation. Completion stays a manual, human decision.
async function markScheduledTasks(schedule) {
  const scheduledNames = new Set(schedule.blocks.map((b) => b.task).filter(Boolean));
  if (scheduledNames.size === 0) return;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const todos = await getTodos(token);
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    const next = todos.map((t) => {
      if (!t.recurring && !t.completed && scheduledNames.has(t.name) && t.scheduledFor !== today) {
        changed = true;
        return { ...t, scheduledFor: today };
      }
      return t;
    });
    if (changed) await putTodos(token, next);
  } catch {
    // cosmetic tag — fine to skip if storage is down
  }
}

export function GenerationProvider({ children }) {
  // { status: 'idle' | 'running' | 'done' | 'error' | 'cancelled', jobId, mode, schedule, signals, error }
  const [generation, setGeneration] = useState({ status: 'idle' });
  const pollAbortRef = useRef(null);
  const jobIdRef = useRef(null);

  async function track(jobId, mode) {
    const controller = new AbortController();
    pollAbortRef.current = controller;
    try {
      const result = await pollScheduleJob(jobId, { signal: controller.signal });
      if (controller.signal.aborted || result.status === 'cancelled') {
        setGeneration({ status: 'idle' });
        return;
      }
      setGeneration({ status: 'done', jobId, mode: result.mode ?? mode, schedule: result.schedule, signals: result.signals });
      markScheduledTasks(result.schedule); // fire-and-forget
    } catch (e) {
      if (controller.signal.aborted) return;
      setGeneration({ status: 'error', jobId, mode, error: e.message });
    } finally {
      sessionStorage.removeItem(PENDING_JOB_KEY);
      if (pollAbortRef.current === controller) pollAbortRef.current = null;
    }
  }

  async function start(sleep, mode, tasks, routines) {
    // The ID token lets the server save the result to Greg; generation
    // itself works without it.
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    const jobId = await startSchedule(sleep, mode, tasks, routines, idToken);
    jobIdRef.current = jobId;
    sessionStorage.setItem(PENDING_JOB_KEY, JSON.stringify({ jobId, mode }));
    setGeneration({ status: 'running', jobId, mode });
    track(jobId, mode);
  }

  // Stop button: kill the poll, tell the server to abort its upstream
  // Featherless call, and forget the job.
  function stop() {
    const jobId = jobIdRef.current;
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    sessionStorage.removeItem(PENDING_JOB_KEY);
    setGeneration({ status: 'idle' });
    if (jobId) cancelScheduleJob(jobId).catch(() => {});
    jobIdRef.current = null;
  }

  // Acknowledge a finished/failed run (after viewing or dismissing).
  function clear() {
    jobIdRef.current = null;
    setGeneration({ status: 'idle' });
  }

  // A job that was running when the page refreshed: re-attach to it.
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_JOB_KEY);
    if (!raw) return;
    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(PENDING_JOB_KEY);
      return;
    }
    jobIdRef.current = pending.jobId;
    setGeneration({ status: 'running', jobId: pending.jobId, mode: pending.mode });
    track(pending.jobId, pending.mode);
  }, []);

  return (
    <GenerationContext.Provider value={{ generation, start, stop, clear }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  return useContext(GenerationContext);
}
