/**
 * The chat model answers in JSON ({"reply": "...", ...}), but the user should
 * see the reply text appear as it generates. This extractor watches the raw
 * model output as it streams in and yields just the decoded "reply" string
 * value, chunk by chunk, before the JSON is complete.
 */
export function createReplyExtractor() {
  let text = '';
  let emitted = '';

  return {
    /** Append a raw model chunk; returns any newly-available reply text. */
    push(chunk) {
      text += chunk;
      const current = scanReply(text);
      if (current.length > emitted.length && current.startsWith(emitted)) {
        const delta = current.slice(emitted.length);
        emitted = current;
        return delta;
      }
      return '';
    },
  };
}

const SIMPLE_ESCAPES = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

// Decode the "reply" string value from a (possibly truncated) JSON text.
// Escape sequences split across chunk boundaries are left for the next scan.
function scanReply(text) {
  const start = text.match(/"reply"\s*:\s*"/);
  if (!start) return '';

  let i = start.index + start[0].length;
  let out = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') break; // closing quote — reply is complete
    if (ch !== '\\') {
      out += ch;
      i += 1;
      continue;
    }
    if (i + 1 >= text.length) break; // escape cut off mid-stream — wait for more
    const next = text[i + 1];
    if (SIMPLE_ESCAPES[next] != null) {
      out += SIMPLE_ESCAPES[next];
      i += 2;
    } else if (next === 'u') {
      if (i + 6 > text.length) break;
      const hex = text.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
    } else {
      i += 2; // unknown escape — skip it
    }
  }
  return out;
}
