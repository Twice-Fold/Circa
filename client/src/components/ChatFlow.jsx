import { useEffect, useRef, useState } from 'react';
import { fileToDataUrl, parseScreenshot, chatTurnStream } from '../api.js';
import { parseHealthExport } from '../lib/parseHealthExport.js';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const ZIP_NAME = /\.zip$/i;
const MAX_BYTES = 20 * 1024 * 1024;

const GREETING =
  'Hey — I’m Circa Sol 👋 I’ll help you pull in last night’s sleep data; it takes about a minute. ' +
  'Which app tracks your sleep — Apple Health, Google Fit, or Fitbit? (Something else works too, just name it.) ' +
  'And if you already know your way around, send me a screenshot of last night’s sleep and I’ll take it from there.';

export default function ChatFlow({ onReady, onBail }) {
  const [messages, setMessages] = useState([{ id: 0, role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState(null);
  const [draftReply, setDraftReply] = useState(null); // streams in before the turn completes
  const [error, setError] = useState(null);
  const [readySleep, setReadySleep] = useState(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const idRef = useRef(1);
  // Full parsed export (incl. the stage timeline) — the chat model only echoes
  // the summary shape, so the detail is re-attached at handoff.
  const exportRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, draftReply]);

  // What the model sees: for screenshot messages, the machine note instead of the caption.
  function apiHistory(msgs) {
    return msgs.map((m) => ({ role: m.role, content: m.apiContent ?? m.content }));
  }

  async function advance(nextMessages) {
    setMessages(nextMessages); // show the user's message immediately, not after the reply lands
    setBusy(true);
    setBusyLabel(null);
    setError(null);
    setDraftReply(null);
    try {
      const turn = await chatTurnStream(apiHistory(nextMessages), setDraftReply);
      // The validated turn replaces the streamed draft — if the server had to do
      // a correction retry, turn.reply is the authoritative text.
      setMessages([...nextMessages, { id: idRef.current++, role: 'assistant', content: turn.reply }]);
      // Track the latest state each turn: later turns can enrich the data
      // (e.g. an optional stage screenshot) or withdraw readiness entirely.
      setReadySleep(turn.status === 'ready' && turn.sleep ? turn.sleep : null);
    } catch (e) {
      setMessages(nextMessages);
      setError(`${e.message} — your messages are still here, try sending again.`);
    } finally {
      setBusy(false);
      setBusyLabel(null);
      setDraftReply(null);
    }
  }

  function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    advance([...messages, { id: idRef.current++, role: 'user', content: text }]);
  }

  function handleAttachment(file) {
    if (!file || busy) return;
    setError(null);
    if (ZIP_NAME.test(file.name)) {
      handleExport(file);
    } else {
      handleImage(file);
    }
  }

  // Apple Health export.zip — unpacked and parsed entirely on this device;
  // only the extracted summary enters the conversation as a machine note.
  async function handleExport(file) {
    setBusy(true);
    setBusyLabel('Reading your Health export on this device…');
    const userMsg = { id: idRef.current++, role: 'user', content: 'Here’s my Apple Health export.' };
    const next = [...messages, userMsg];
    setMessages(next);
    try {
      const sleep = await parseHealthExport(file, setBusyLabel);
      exportRef.current = sleep;
      const summary = {
        bedtime: sleep.bedtime,
        wake_time: sleep.wake_time,
        duration_minutes: sleep.duration_minutes,
        sleep_quality: sleep.sleep_quality,
        stages: sleep.stages,
        notes: sleep.notes,
      };
      userMsg.apiContent = `[HEALTH EXPORT PARSED] ${JSON.stringify(summary)}`;
    } catch (e) {
      userMsg.apiContent = `[HEALTH EXPORT UNREADABLE] ${e.message}`;
    }
    await advance(next);
  }

  async function handleImage(file) {
    if (!ACCEPTED.includes(file.type)) {
      setError('That doesn’t look like something I can read — PNG/JPEG/WebP screenshots or an Apple Health export.zip.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That screenshot is over 20MB — try a smaller one.');
      return;
    }

    setBusy(true);
    setBusyLabel('Reading your screenshot…');
    let dataUrl;
    try {
      dataUrl = await fileToDataUrl(file);
    } catch (e) {
      setError(e.message);
      setBusy(false);
      setBusyLabel(null);
      return;
    }

    const userMsg = { id: idRef.current++, role: 'user', content: 'Here’s a screenshot.', image: dataUrl };
    const next = [...messages, userMsg];
    setMessages(next);

    try {
      const sleep = await parseScreenshot(dataUrl);
      exportRef.current = null; // a newer screenshot supersedes any earlier export's timeline
      userMsg.apiContent = `[SCREENSHOT PARSED] ${JSON.stringify(sleep)}`;
    } catch (e) {
      userMsg.apiContent = `[SCREENSHOT UNREADABLE] ${e.message}`;
    }
    await advance(next);
  }

  return (
    <div className="card chat-card">
      <div className="chat-head">
        <div className="sol-identity">
          <div className="sol-avatar" aria-hidden="true">☀️</div>
          <div className="sol-titles">
            <span className="sol-name">Circa Sol</span>
            <span className="sol-sub">Your guided sleep setup</span>
          </div>
        </div>
        <button className="link-btn" onClick={onBail}>Know exactly what you’re doing? Upload directly</button>
      </div>

      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.image && <img className="bubble-img" src={m.image} alt="Your screenshot" />}
            <p>{m.content}</p>
          </div>
        ))}
        {busy && draftReply && (
          <div className="bubble assistant">
            <p>{draftReply}<span className="stream-caret" aria-hidden="true" /></p>
          </div>
        )}
        {busy && !draftReply && (
          <div className="bubble assistant typing" aria-label={busyLabel ?? 'Circa Sol is typing'}>
            {busyLabel && <span className="typing-label">{busyLabel}</span>}
            <span className="dot" /><span className="dot" /><span className="dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error-text">{error}</p>}

      {readySleep && (
        <div className="chat-ready">
          <button
            className="btn-primary"
            onClick={() =>
              onReady(
                exportRef.current
                  ? { ...readySleep, origin: 'health_export', detail: exportRef.current.detail ?? null }
                  : readySleep
              )
            }
          >
            Review my sleep data →
          </button>
        </div>
      )}

      <form className="chat-input" onSubmit={handleSend}>
          <button
            type="button"
            className="attach-btn"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Attach a screenshot or Apple Health export"
            title="Attach a screenshot or Apple Health export"
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={[...ACCEPTED, '.zip', 'application/zip'].join(',')}
            hidden
            onChange={(e) => {
              handleAttachment(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            type="text"
            value={input}
            placeholder={busy ? 'Circa Sol is thinking…' : 'Type a reply, or attach a file'}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button className="btn-primary small" type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
    </div>
  );
}
