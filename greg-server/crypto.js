import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * Key-split encryption: Greg encrypts and decrypts, but never keeps a key.
 * The per-user 256-bit key lives in Firestore (managed by the Cloud Run
 * backend) and arrives base64-encoded in the X-Data-Key header of each
 * request. Losing Greg's disk leaks nothing readable.
 */

export function parseKey(header) {
  if (typeof header !== 'string' || header.length === 0) return null;
  let key;
  try {
    key = Buffer.from(header, 'base64');
  } catch {
    return null;
  }
  return key.length === 32 ? key : null;
}

export function encrypt(key, payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/** Throws on tampering or a wrong key (GCM auth failure). */
export function decrypt(key, { iv, tag, ciphertext }) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}
