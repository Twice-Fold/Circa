import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/greg.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Only uid/mode/timestamp are plaintext (needed to list and sort without a
// key); everything the user actually said or did lives in the ciphertext.
db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    iv TEXT NOT NULL,
    tag TEXT NOT NULL,
    ciphertext TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_schedules_uid_created ON schedules (uid, created_at DESC);
`);

// Per-user encrypted documents (to-do list, routines): one blob per
// (uid, doc_type), replaced wholesale on save. Same key-split as schedules.
db.exec(`
  CREATE TABLE IF NOT EXISTS user_docs (
    uid TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    iv TEXT NOT NULL,
    tag TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    PRIMARY KEY (uid, doc_type)
  );
`);

export const upsertDoc = db.prepare(`
  INSERT INTO user_docs (uid, doc_type, updated_at, iv, tag, ciphertext)
  VALUES (@uid, @doc_type, @updated_at, @iv, @tag, @ciphertext)
  ON CONFLICT (uid, doc_type) DO UPDATE SET
    updated_at = excluded.updated_at,
    iv = excluded.iv,
    tag = excluded.tag,
    ciphertext = excluded.ciphertext
`);

export const getDoc = db.prepare(`
  SELECT updated_at, iv, tag, ciphertext FROM user_docs WHERE uid = ? AND doc_type = ?
`);

export const insertSchedule = db.prepare(`
  INSERT INTO schedules (id, uid, mode, created_at, iv, tag, ciphertext)
  VALUES (@id, @uid, @mode, @created_at, @iv, @tag, @ciphertext)
`);

export const deleteScheduleById = db.prepare(`
  DELETE FROM schedules WHERE id = ? AND uid = ?
`);

export const listSchedulesByUid = db.prepare(`
  SELECT id, mode, created_at, iv, tag, ciphertext
  FROM schedules
  WHERE uid = ?
  ORDER BY created_at DESC
`);

export default db;
