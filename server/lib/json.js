import { chatCompletion, apiError } from '../featherless.js';

/**
 * Pull a JSON object out of model output that may be wrapped in markdown
 * fences or surrounded by prose. Throws with a descriptive message on failure.
 */
export function extractJson(text) {
  const attempts = [];

  attempts.push(text.trim());

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1));

  let lastError;
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      lastError = new Error('Parsed value is not a JSON object');
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`No valid JSON object found in model output: ${lastError?.message}`);
}

/**
 * Call the model expecting JSON back. If extraction or validation fails,
 * retry once with the error appended so the model can correct itself.
 *
 * validate(obj) should throw with a human-readable message on bad shape,
 * and may return a normalized copy of the object.
 */
export async function jsonCompletion({ validate, ...request }) {
  let raw;
  try {
    raw = await chatCompletion(request);
    const obj = extractJson(raw);
    return validate ? validate(obj) : obj;
  } catch (firstError) {
    // Upstream/transport failures won't be fixed by a retry prompt — rethrow.
    if (firstError.code) throw firstError;

    const retryMessages = [
      ...request.messages,
      { role: 'assistant', content: raw ?? '' },
      {
        role: 'user',
        content:
          `Your previous response failed validation: ${firstError.message}\n` +
          'Respond again with ONLY the corrected JSON object. No markdown, no explanation.',
      },
    ];

    try {
      const retryRaw = await chatCompletion({ ...request, messages: retryMessages, temperature: 0.1 });
      const obj = extractJson(retryRaw);
      return validate ? validate(obj) : obj;
    } catch (secondError) {
      if (secondError.code) throw secondError;
      throw apiError(
        `Model could not produce valid JSON after retry: ${secondError.message}`,
        'BAD_MODEL_JSON',
        502
      );
    }
  }
}
