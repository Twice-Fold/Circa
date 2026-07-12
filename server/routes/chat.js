import { Router } from 'express';
import { extractJson } from '../lib/json.js';
import { createReplyExtractor } from '../lib/reply-stream.js';
import { normalizeTime } from '../lib/time.js';
import { normalizeStages } from '../lib/stages.js';
import { chatCompletion, streamChatCompletion, apiError } from '../featherless.js';
import { CHAT_SYSTEM } from '../prompts.js';

const router = Router();

const MAX_TURNS = 40;
const MAX_MESSAGE_CHARS = 4000;

function validateChatTurn(obj) {
  if (typeof obj.reply !== 'string' || !obj.reply.trim()) {
    throw new Error('Missing "reply" string');
  }
  const status = obj.status === 'ready' ? 'ready' : 'gathering';

  let sleep = null;
  if (obj.sleep && typeof obj.sleep === 'object') {
    const duration = obj.sleep.duration_minutes == null ? null : Number(obj.sleep.duration_minutes);
    sleep = {
      bedtime: normalizeTime(obj.sleep.bedtime),
      wake_time: normalizeTime(obj.sleep.wake_time),
      duration_minutes:
        Number.isFinite(duration) && duration > 0 && duration <= 24 * 60 ? Math.round(duration) : null,
      sleep_quality: obj.sleep.sleep_quality == null ? null : String(obj.sleep.sleep_quality).slice(0, 120),
      stages: normalizeStages(obj.sleep.stages),
    };
  }

  if (status === 'ready' && (!sleep?.bedtime || !sleep?.wake_time)) {
    throw new Error('status "ready" requires sleep.bedtime and sleep.wake_time as valid HH:MM times');
  }

  return { reply: obj.reply.trim(), status, sleep };
}

/**
 * Streams the model's JSON answer, forwarding the "reply" field to
 * onReplyDelta as it generates. Transient upstream failures are retried once,
 * but only while nothing has been forwarded yet (a retry after that would
 * duplicate visible text). Validation failures get one correction round trip
 * (non-streamed); the client swaps in the corrected reply at the end.
 */
async function streamedChatTurn(request, onReplyDelta) {
  let sentAny = false;
  const attempt = (useBackupKey = false) => {
    const extractor = createReplyExtractor();
    return streamChatCompletion({
      ...request,
      useBackupKey,
      onDelta: (chunk) => {
        const text = extractor.push(chunk);
        if (text) {
          sentAny = true;
          onReplyDelta(text);
        }
      },
    });
  };

  let raw;
  try {
    raw = await attempt();
  } catch (e) {
    if (sentAny || !['EMPTY_RESPONSE', 'UPSTREAM_TRANSIENT'].includes(e.code)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    raw = await attempt(e.upstreamStatus === 429); // a busy primary key → retry on the backup
  }

  try {
    return validateChatTurn(extractJson(raw));
  } catch (validationError) {
    const retryRaw = await chatCompletion({
      ...request,
      temperature: 0.1,
      messages: [
        ...request.messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content:
            `Your previous response failed validation: ${validationError.message}\n` +
            'Respond again with ONLY the corrected JSON object. No markdown, no explanation.',
        },
      ],
    });
    try {
      return validateChatTurn(extractJson(retryRaw));
    } catch (secondError) {
      throw apiError(`Model could not produce valid JSON after retry: ${secondError.message}`, 'BAD_MODEL_JSON', 502);
    }
  }
}

router.post('/chat', async (req, res, next) => {
  let clean;
  try {
    const { messages } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      throw apiError('Expected a non-empty "messages" array.', 'BAD_MESSAGES', 400);
    }
    // Keep the tail of long conversations; sanitize roles and cap message size.
    clean = messages.slice(-MAX_TURNS).map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content ?? '').slice(0, MAX_MESSAGE_CHARS),
    }));
  } catch (e) {
    return next(e); // bad input fails as normal JSON, before any streaming starts
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // If the browser disconnects (refresh, closed tab), cancel the upstream
  // generation too — otherwise it keeps burning concurrency units for nothing.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  try {
    const turn = await streamedChatTurn(
      {
        model: process.env.CHAT_MODEL || 'google/gemma-4-31B-it',
        temperature: 0.6,
        maxTokens: 600,
        messages: [{ role: 'system', content: CHAT_SYSTEM }, ...clean],
        signal: abort.signal,
      },
      (text) => send('delta', { text })
    );
    send('turn', { turn });
  } catch (e) {
    if (e.code === 'CLIENT_ABORTED') {
      console.log('[chat] client disconnected mid-turn — upstream request cancelled');
    } else {
      send('error', { error: e.message, code: e.code ?? 'CHAT_FAILED' });
    }
  } finally {
    res.end();
  }
});

export default router;
