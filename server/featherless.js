const BASE_URL = () => process.env.FEATHERLESS_BASE_URL || 'https://api.featherless.ai/v1';

const TIMEOUT_MS = 90_000;

export function apiError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenAI-compatible chat completion call against Featherless.
 * Transient upstream flakes (empty content on a 200, 429, 5xx) are retried
 * once with the identical request before giving up.
 * Returns the assistant message content as a string.
 *
 * Pass `signal` (an AbortSignal) to cancel the upstream request when the
 * client disconnects — otherwise an abandoned request keeps generating on
 * Featherless's side and holds concurrency units until it finishes.
 */
export async function chatCompletion(request) {
  try {
    return await attemptChatCompletion(request);
  } catch (e) {
    if (request.signal?.aborted) throw e;
    if (!['EMPTY_RESPONSE', 'UPSTREAM_TRANSIENT'].includes(e.code)) throw e;
    const useBackupKey = e.upstreamStatus === 429 && hasBackupKey();
    console.warn(`[featherless] first attempt failed (${e.code}): ${e.message} — retrying once${useBackupKey ? ' on the backup key' : ''}`);
    await sleep(1500);
    return attemptChatCompletion({ ...request, useBackupKey });
  }
}

// The upstream fetch needs its own controller for the timeout; this ties an
// optional caller signal (client disconnect) into it. Returns a cleanup fn.
function linkSignal(external, controller) {
  if (!external) return () => {};
  if (external.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  external.addEventListener('abort', onAbort, { once: true });
  return () => external.removeEventListener('abort', onAbort);
}

function abortError(external, timeoutMs, model) {
  if (external?.aborted) {
    return apiError('Client disconnected — upstream request cancelled.', 'CLIENT_ABORTED', 499);
  }
  return apiError(`Featherless call timed out after ${timeoutMs / 1000}s (model: ${model}).`, 'UPSTREAM_TIMEOUT', 504);
}

/**
 * Streaming variant: calls onDelta(chunk) for each content fragment as it
 * arrives and resolves with the full assistant message once the stream ends.
 * No built-in retry — the caller decides, since chunks may already have been
 * forwarded to the client.
 */
export async function streamChatCompletion({ model, messages, temperature = 0.4, maxTokens = 2500, extra = {}, timeoutMs = TIMEOUT_MS, onDelta, signal, useBackupKey = false }) {
  const apiKey = requireApiKey(useBackupKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const unlink = linkSignal(signal, controller);

  const body = { model, messages, temperature, max_tokens: maxTokens, stream: true, ...extra };
  logRequest(body);
  const startedAt = Date.now();

  let res;
  try {
    res = await fetch(`${BASE_URL()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    unlink();
    if (e.name === 'AbortError') throw abortError(signal, timeoutMs, model);
    throw apiError(`Could not reach Featherless: ${e.message}`, 'UPSTREAM_UNREACHABLE', 502);
  }

  if (!res.ok) {
    clearTimeout(timer);
    unlink();
    const errBody = await res.text().catch(() => '');
    const transient = res.status === 429 || res.status >= 500;
    const err = apiError(
      `Featherless returned ${res.status} for model "${model}": ${errBody.slice(0, 300)}`,
      transient ? 'UPSTREAM_TRANSIENT' : 'UPSTREAM_ERROR',
      502
    );
    err.upstreamStatus = res.status;
    throw err;
  }

  let content = '';
  let buffer = '';
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue; // malformed keep-alive noise — skip
        }
        const delta = event?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          content += delta;
          onDelta?.(delta);
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw abortError(signal, timeoutMs, model);
    throw apiError(`Featherless stream failed mid-response: ${e.message}`, 'UPSTREAM_TRANSIENT', 502);
  } finally {
    clearTimeout(timer);
    unlink();
  }

  if (content.length === 0) {
    throw apiError(`Featherless returned an empty response for model "${model}" (transient upstream issue).`, 'EMPTY_RESPONSE', 502);
  }
  console.log(`[featherless] ← ${model} stream finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${content.length} chars)`);
  return content;
}

// Every upstream request body gets logged in full right before the fetch —
// except base64 image payloads, which would drown the log in megabytes.
function redactDataUrls(value) {
  if (typeof value === 'string') {
    return value.startsWith('data:') && value.length > 200
      ? `${value.slice(0, 50)}…[${value.length - 50} more chars of base64 omitted]`
      : value;
  }
  if (Array.isArray(value)) return value.map(redactDataUrls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDataUrls(v)]));
  }
  return value;
}

function logRequest(body) {
  console.log(
    `[featherless] → POST ${BASE_URL()}/chat/completions (model=${body.model}, stream=${Boolean(body.stream)})\n` +
      JSON.stringify(redactDataUrls(body), null, 2)
  );
}

// A second key (FEATHERLESS_BACKUP_KEY) gets its own concurrency budget on
// Featherless's side — retries after a 429 switch to it so a busy primary
// key doesn't stall the whole request.
export function hasBackupKey() {
  const backup = process.env.FEATHERLESS_BACKUP_KEY;
  return Boolean(backup && backup !== 'paste-your-second-key-here');
}

function requireApiKey(useBackup = false) {
  if (useBackup && hasBackupKey()) return process.env.FEATHERLESS_BACKUP_KEY;
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey || apiKey === 'paste-your-key-here') {
    throw apiError(
      'FEATHERLESS_API_KEY is not set. Paste your key into server/.env and restart.',
      'NO_API_KEY',
      500
    );
  }
  return apiKey;
}

async function attemptChatCompletion({ model, messages, temperature = 0.4, maxTokens = 2500, extra = {}, timeoutMs = TIMEOUT_MS, signal, useBackupKey = false }) {
  const apiKey = requireApiKey(useBackupKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const unlink = linkSignal(signal, controller);

  const body = { model, messages, temperature, max_tokens: maxTokens, ...extra };
  logRequest(body);
  const startedAt = Date.now();

  let data;
  try {
    let res;
    try {
      res = await fetch(`${BASE_URL()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) throw abortError(signal, timeoutMs, model);
      throw apiError(`Could not reach Featherless: ${e.message}`, 'UPSTREAM_UNREACHABLE', 502);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const transient = res.status === 429 || res.status >= 500;
      const err = apiError(
        `Featherless returned ${res.status} for model "${model}": ${errBody.slice(0, 300)}`,
        transient ? 'UPSTREAM_TRANSIENT' : 'UPSTREAM_ERROR',
        502
      );
      err.upstreamStatus = res.status;
      throw err;
    }

    // The timeout must cover this read too: a non-streaming completion sends
    // headers immediately but the JSON body only lands once the model has
    // finished generating — without the timer armed here, a slow generation
    // hangs the request forever.
    try {
      data = await res.json();
    } catch (e) {
      if (controller.signal.aborted) throw abortError(signal, timeoutMs, model);
      throw apiError(`Featherless response body was unreadable for model "${model}": ${e.message}`, 'UPSTREAM_TRANSIENT', 502);
    }
  } finally {
    clearTimeout(timer);
    unlink();
  }

  const message = data?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw apiError(`Featherless returned an empty response for model "${model}" (transient upstream issue).`, 'EMPTY_RESPONSE', 502);
  }
  const reasoningField = ['reasoning_content', 'reasoning'].find((k) => typeof message?.[k] === 'string' && message[k]);
  const reasoning = reasoningField ? `, +${message[reasoningField].length} chars ${reasoningField}` : '';
  console.log(`[featherless] ← ${model} responded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${content.length} chars${reasoning})`);
  return content;
}
