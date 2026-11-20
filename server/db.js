'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

/* On Vercel the filesystem is ephemeral, so the database and user files live
   in a temp folder and are mirrored to a private Vercel Blob store. */
const BLOB_ENABLED = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = BLOB_ENABLED || VERCEL
  ? path.join(os.tmpdir(), 'greenfield-school-portal')
  : path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
const DB_PATH = path.join(DATA_DIR, 'school.db');
const BLOB_DB = 'greenfield-school-portal/school.db';
const BLOB_UPLOADS = 'greenfield-school-portal/uploads/';
const BLOB_EXPORTS = 'greenfield-school-portal/exports/';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

let db = null;
let initPromise = null;

async function blobModule() {
  return import('@vercel/blob');
}

async function blobRead(pathname) {
  if (!BLOB_ENABLED) return null;
  const { get } = await blobModule();
  let result;
  try {
    result = await get(pathname, { access: 'private' });
  } catch (err) {
    console.error('[blob] read failed', pathname, err.message);
    return null;
  }
  if (!result || result.statusCode !== 200) return null;
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function blobWrite(pathname, bytes, contentType = 'application/octet-stream') {
  if (!BLOB_ENABLED) return;
  const { put } = await blobModule();
  await put(pathname, bytes, { access: 'private', contentType });
}

async function blobDelete(pathname) {
  if (!BLOB_ENABLED) return;
  const { del } = await blobModule();
  await del(pathname, { access: 'private' });
}

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin','teacher','student')),
  phone         TEXT,
  color         TEXT    DEFAULT '#4f46e5',
  photo         TEXT,
  created_at    TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teachers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_no    TEXT    UNIQUE,
  specialty   TEXT,
  qualification TEXT,
  hired_at    TEXT
);

CREATE TABLE IF NOT EXISTS sections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,
  code            TEXT    UNIQUE,
  level           TEXT,
  head_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  description     TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,
  level           TEXT    NOT NULL,
  section_id      INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  form_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  room            TEXT,
  capacity        INTEGER DEFAULT 30
);

CREATE TABLE IF NOT EXISTS students (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  admission_no  TEXT    NOT NULL UNIQUE,
  class_id      INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  gender        TEXT,
  dob           TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  address       TEXT,
  status        TEXT    DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  code       TEXT    NOT NULL UNIQUE,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  class_id   INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  periods    INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS attendance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note        TEXT,
  recorded_by INTEGER,
  UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS grades (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  term        TEXT    NOT NULL,
  assessment  TEXT    NOT NULL,
  score       REAL    NOT NULL,
  max_score   REAL    NOT NULL DEFAULT 100,
  recorded_by INTEGER,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timetable (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  day        TEXT    NOT NULL,
  start_time TEXT    NOT NULL,
  end_time   TEXT    NOT NULL,
  room       TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  audience   TEXT    NOT NULL DEFAULT 'all',
  author_id  INTEGER,
  pinned     INTEGER DEFAULT 0,
  created_at TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term        TEXT    NOT NULL,
  description TEXT    NOT NULL,
  amount      REAL    NOT NULL,
  paid        REAL    NOT NULL DEFAULT 0,
  due_date    TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grades_unique
  ON grades (student_id, subject_id, term, assessment);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_attendance_class ON attendance (class_id, date);
CREATE INDEX IF NOT EXISTS idx_fees_student ON fees (student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
`;

function ensureColumn(table, column, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

function openDatabase() {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON');
  if (!BLOB_ENABLED) db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  ensureColumn('users', 'photo', 'TEXT');
  ensureColumn('classes', 'section_id', 'INTEGER');
}

async function initDb() {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      if (BLOB_ENABLED) {
        const bytes = await blobRead(BLOB_DB);
        if (bytes) fs.writeFileSync(DB_PATH, bytes);
      }
      openDatabase();
      return db;
    })();
  }
  return initPromise;
}

function getDb() {
  if (!db) throw new Error('Database is not initialised yet.');
  return db;
}

async function syncDb() {
  if (!BLOB_ENABLED || !db) return;
  await blobWrite(BLOB_DB, fs.readFileSync(DB_PATH));
}

/* ------------------------------------------------------------------ */
/*  File helpers (mirrored to Blob on Vercel)                          */
/* ------------------------------------------------------------------ */

async function saveUpload(name, buffer) {
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  await blobWrite(BLOB_UPLOADS + name, buffer);
}

async function readUpload(name) {
  const local = path.join(UPLOADS_DIR, name);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  return blobRead(BLOB_UPLOADS + name);
}

async function deleteUpload(name) {
  try { fs.unlinkSync(path.join(UPLOADS_DIR, name)); } catch { /* already gone */ }
  await blobDelete(BLOB_UPLOADS + name);
}

async function saveExport(name, buffer) {
  fs.writeFileSync(path.join(EXPORTS_DIR, name), buffer);
  await blobWrite(BLOB_EXPORTS + name, buffer, 'application/pdf');
}

async function readExport(name) {
  const local = path.join(EXPORTS_DIR, name);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  return blobRead(BLOB_EXPORTS + name);
}

/* ------------------------------------------------------------------ */
/*  Password helpers                                                   */
/* ------------------------------------------------------------------ */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return check.length === expected.length && crypto.timingSafeEqual(check, expected);
}

/* ------------------------------------------------------------------ */
/*  Small helpers shared by API                                        */
/* ------------------------------------------------------------------ */

const TERM = 'Term 1 · 2025/26';
const SCHOOL = {
  name: 'Greenfield Academy',
  motto: 'Knowledge · Integrity · Service',
  address: '12 Palm Avenue, Ikeja, Lagos',
  phone: '+234 803 555 0142',
  email: 'hello@greenfield.edu.ng',
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [
  ['08:00', '08:45'],
  ['08:50', '09:35'],
  ['09:40', '10:25'],
  ['11:00', '11:45'],
  ['11:50', '12:35'],
];

function letterGrade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 40) return 'E';
  return 'F';
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function isSeeded() {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM users').get();
  return row.n > 0;
}

module.exports = {
  initDb, getDb, syncDb,
  saveUpload, readUpload, deleteUpload,
  saveExport, readExport,
  hashPassword, verifyPassword, isSeeded,
  TERM, SCHOOL, DAYS, PERIODS, letterGrade, todayISO,
  DATA_DIR, UPLOADS_DIR, EXPORTS_DIR, BLOB_ENABLED,
};
