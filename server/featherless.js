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
 */
export async function chatCompletion(request) {
  try {
    return await attemptChatCompletion(request);
  } catch (e) {
    if (!['EMPTY_RESPONSE', 'UPSTREAM_TRANSIENT'].includes(e.code)) throw e;
    await sleep(1500);
    return attemptChatCompletion(request);
  }
}

async function attemptChatCompletion({ model, messages, temperature = 0.4, maxTokens = 2500, extra = {} }) {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey || apiKey === 'paste-your-key-here') {
    throw apiError(
      'FEATHERLESS_API_KEY is not set. Paste your key into server/.env and restart.',
      'NO_API_KEY',
      500
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${BASE_URL()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...extra }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw apiError(`Featherless call timed out after ${TIMEOUT_MS / 1000}s (model: ${model}).`, 'UPSTREAM_TIMEOUT', 504);
    }
    throw apiError(`Could not reach Featherless: ${e.message}`, 'UPSTREAM_UNREACHABLE', 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const transient = res.status === 429 || res.status >= 500;
    throw apiError(
      `Featherless returned ${res.status} for model "${model}": ${body.slice(0, 300)}`,
      transient ? 'UPSTREAM_TRANSIENT' : 'UPSTREAM_ERROR',
      502
    );
  }

  const data = await res.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw apiError(`Featherless returned an empty response for model "${model}" (transient upstream issue).`, 'EMPTY_RESPONSE', 502);
  }
  return content;
}
