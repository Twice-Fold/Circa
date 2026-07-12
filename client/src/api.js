async function post(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the Circa server — is it running on port 3001?');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // fall through to the generic error below
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export async function parseScreenshot(dataUrl) {
  const { sleep } = await post('/api/parse', { image: dataUrl });
  return sleep;
}

/**
 * Schedule generation runs as a server-side job so it survives page
 * refreshes: start it, remember the job id, poll until it resolves.
 */
async function authedJson(path, idToken, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Could not reach the Circa server — is it running on port 3001?');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export async function startSchedule(sleep, mode = 'flow', tasks = [], routines = [], idToken = null) {
  const data = await authedJson('/api/schedule', idToken, {
    method: 'POST',
    body: JSON.stringify({ sleep, mode, tasks, routines }),
  });
  return data.jobId;
}

export async function cancelScheduleJob(jobId) {
  return post(`/api/schedule/${jobId}/cancel`, {});
}

/** Past schedules, decrypted via the key-split (server + Greg). */
export async function getHistory(idToken) {
  return (await authedJson('/api/history', idToken)).schedules;
}

export async function deleteHistoryEntry(idToken, id) {
  await authedJson(`/api/history/${encodeURIComponent(id)}`, idToken, { method: 'DELETE' });
}

/** Dev-only: the signed-in user's last generation, if the account is allowed. */
export async function getDebugInfo(idToken) {
  return (await authedJson('/api/debug/last-generation', idToken)).generation;
}

/** Persistent to-do list and routines — encrypted at rest on Greg. */
export async function getTodos(idToken) {
  return (await authedJson('/api/todos', idToken)).todos;
}
export async function putTodos(idToken, todos) {
  return (await authedJson('/api/todos', idToken, { method: 'PUT', body: JSON.stringify({ todos }) })).todos;
}
export async function getRoutines(idToken) {
  return (await authedJson('/api/routines', idToken)).routines;
}
export async function putRoutines(idToken, routines) {
  return (await authedJson('/api/routines', idToken, { method: 'PUT', body: JSON.stringify({ routines }) })).routines;
}

export async function pollScheduleJob(jobId, { signal } = {}) {
  // Rhythm's server budget is 10 minutes — the poll must outlast it.
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) return { status: 'cancelled' };
    let res;
    try {
      res = await fetch(`/api/schedule/${jobId}`, { signal });
    } catch (e) {
      if (signal?.aborted) return { status: 'cancelled' };
      throw new Error('Could not reach the Circa server — is it running on port 3001?');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // fall through to the generic error below
    }
    if (data?.status === 'done' || data?.status === 'cancelled') return data;
    if (!res.ok || data?.status === 'error') {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('Schedule generation timed out — try again.');
}

/**
 * Streams a chat turn. onReplyText receives the assistant's reply-so-far
 * (cumulative) as it generates; resolves with the complete validated turn.
 */
export async function chatTurnStream(messages, onReplyText) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  } catch {
    throw new Error('Could not reach the Circa server — is it running on port 3001?');
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      // fall through to the generic error below
    }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';
  let turn = null;
  let streamError = null;

  function handleEvent(block) {
    let event = 'message';
    let dataStr = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
    }
    let data;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return;
    }
    if (event === 'delta' && typeof data.text === 'string') {
      reply += data.text;
      onReplyText?.(reply);
    } else if (event === 'turn') {
      turn = data.turn;
    } else if (event === 'error') {
      streamError = new Error(data.error || 'Chat failed');
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      handleEvent(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
    }
  }

  if (streamError) throw streamError;
  if (!turn) throw new Error('The chat stream ended unexpectedly — try sending that again.');
  return turn;
}
