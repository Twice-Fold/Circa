import { Router } from 'express';
import { upsertDoc, getDoc } from '../db.js';
import { parseKey, encrypt, decrypt } from '../crypto.js';

const router = Router();

const DOC_TYPES = new Set(['todos', 'routines']);
const MAX_STRING_CHARS = 4000;

function apiError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function assertNoRawMedia(value, path = 'data') {
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_CHARS) {
      throw apiError(`"${path}" is too long — Greg stores parsed data, not raw files.`, 'RAW_MEDIA_REJECTED', 400);
    }
    if (/^data:\w+\//.test(value)) {
      throw apiError(`"${path}" looks like an embedded file — Greg stores parsed data only.`, 'RAW_MEDIA_REJECTED', 400);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoRawMedia(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoRawMedia(v, `${path}.${k}`);
  }
}

function requireKey(req) {
  const key = parseKey(req.get('x-data-key'));
  if (!key) {
    throw apiError('Missing or invalid X-Data-Key header (expected base64 of 32 bytes).', 'BAD_KEY', 400);
  }
  return key;
}

function requireDocType(type) {
  if (!DOC_TYPES.has(type)) {
    throw apiError(`Unknown document type "${type}".`, 'BAD_DOC_TYPE', 400);
  }
}

router.put('/docs/:uid/:type', (req, res, next) => {
  try {
    const key = requireKey(req);
    requireDocType(req.params.type);
    const uid = req.params.uid;
    if (!uid || uid.length > 128) throw apiError('Bad uid.', 'BAD_UID', 400);

    const { data } = req.body ?? {};
    if (!Array.isArray(data)) {
      throw apiError('Expected "data" as an array.', 'BAD_DATA', 400);
    }
    assertNoRawMedia(data);

    const updated_at = new Date().toISOString();
    upsertDoc.run({ uid, doc_type: req.params.type, updated_at, ...encrypt(key, data) });
    res.json({ ok: true, updated_at });
  } catch (e) {
    next(e);
  }
});

router.get('/docs/:uid/:type', (req, res, next) => {
  try {
    const key = requireKey(req);
    requireDocType(req.params.type);

    const row = getDoc.get(req.params.uid, req.params.type);
    if (!row) return res.json({ data: null });

    let data;
    try {
      data = decrypt(key, row);
    } catch {
      throw apiError('Document could not be decrypted — wrong key for this user?', 'WRONG_KEY', 403);
    }
    res.json({ data, updated_at: row.updated_at });
  } catch (e) {
    next(e);
  }
});

export default router;
