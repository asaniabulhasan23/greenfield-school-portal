'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  getDb, syncDb, saveUpload, deleteUpload, saveExport,
  verifyPassword, hashPassword, TERM, SCHOOL, DAYS,
  letterGrade, todayISO, UPLOADS_DIR, EXPORTS_DIR,
} = require('./db');

const ASSESSMENTS = [
  ['Quiz 1', 20],
  ['Assignment', 20],
  ['Mid-term Test', 30],
  ['Examination', 30],
];
const TERMS = [TERM];
const SESSION_DAYS = 7;

/* ------------------------------------------------------------------ */
/*  Tiny helpers                                                       */
/* ------------------------------------------------------------------ */

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_500_000) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const bool = (v) => (v === true || v === 1 || v === '1' ? 1 : 0);

function round1(n) {
  return n == null ? null : Math.round(Number(n) * 10) / 10;
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

let queryCache = null;
function queries() {
  if (!queryCache) {
    const database = getDb();
    queryCache = {
      userById: database.prepare(`
        SELECT u.id, u.name, u.email, u.role, u.phone, u.color, u.photo,
               t.id AS teacher_id, s.id AS student_id, s.class_id,
               c.name AS class_name, c.section_id, sec.name AS section_name
        FROM users u
        LEFT JOIN teachers t ON t.user_id = u.id
        LEFT JOIN students s ON s.user_id = u.id
        LEFT JOIN classes c ON c.id = s.class_id
        LEFT JOIN sections sec ON sec.id = c.section_id
        WHERE u.id = ?`),
      userByEmail: database.prepare('SELECT * FROM users WHERE lower(email) = lower(?)'),
      session: database.prepare(`
        SELECT u.id FROM sessions se JOIN users u ON u.id = se.user_id
        WHERE se.token = ? AND se.expires_at > datetime('now')`),
      insertSession: database.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime(\'now\', ?))'),
      deleteSession: database.prepare('DELETE FROM sessions WHERE token = ?'),
      expiredSessions: database.prepare('DELETE FROM sessions WHERE expires_at <= datetime(\'now\')'),
    };
  }
  return queryCache;
}
const q = new Proxy({}, { get: (_, key) => queries()[key] });

function studentSummary(studentId) {
  const att = getDb().prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS attended,
           SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
    FROM attendance WHERE student_id = ?`).get(studentId) || {};
  const grades = getDb().prepare(`
    SELECT SUM(score) AS score, SUM(max_score) AS max, COUNT(*) AS n
    FROM grades WHERE student_id = ?`).get(studentId) || {};
  const fees = getDb().prepare(`
    SELECT SUM(amount) AS billed, SUM(paid) AS paid, SUM(amount - paid) AS balance
    FROM fees WHERE student_id = ?`).get(studentId) || {};
  const pct = grades.max ? (grades.score * 100) / grades.max : null;
  return {
    attendanceRate: att.total ? round1((att.attended * 100) / att.total) : null,
    daysPresent: att.attended || 0,
    daysAbsent: att.absent || 0,
    daysRecorded: att.total || 0,
    average: round1(pct),
    grade: pct == null ? null : letterGrade(pct),
    feeBilled: fees.billed || 0,
    feePaid: fees.paid || 0,
    feeBalance: fees.balance || 0,
  };
}

function classStats(classId) {
  const cls = getDb().prepare(`
    SELECT c.*, u.name AS form_teacher, u.photo AS form_teacher_photo,
           sec.name AS section_name, sec.code AS section_code
    FROM classes c LEFT JOIN teachers t ON t.id = c.form_teacher_id
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN sections sec ON sec.id = c.section_id
    WHERE c.id = ?`).get(classId);
  if (!cls) return null;
  const students = getDb().prepare(`
    SELECT s.id, u.name FROM students s JOIN users u ON u.id = s.user_id
    WHERE s.class_id = ? ORDER BY u.name`).all(classId);
  const att = getDb().prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS attended
    FROM attendance WHERE class_id = ?`).get(classId) || {};
  const perf = getDb().prepare(`
    SELECT AVG(g.score * 100.0 / g.max_score) AS pct
    FROM grades g JOIN students s ON s.id = g.student_id WHERE s.class_id = ?`).get(classId) || {};
  const fees = getDb().prepare(`
    SELECT SUM(f.amount) AS billed, SUM(f.paid) AS paid
    FROM fees f JOIN students s ON s.id = f.student_id WHERE s.class_id = ?`).get(classId) || {};
  return {
    ...cls,
    student_count: students.length,
    average: round1(perf.pct),
    attendanceRate: att.total ? round1((att.attended * 100) / att.total) : null,
    feeBilled: fees.billed || 0,
    feePaid: fees.paid || 0,
    feeBalance: (fees.billed || 0) - (fees.paid || 0),
  };
}

function announcementsFor(role, limit = 50) {
  const audiences = role === 'admin'
    ? ['all', 'students', 'teachers']
    : role === 'teacher' ? ['all', 'teachers'] : ['all', 'students'];
  const marks = audiences.map(() => '?').join(',');
  return getDb().prepare(`
    SELECT a.*, u.name AS author
    FROM announcements a LEFT JOIN users u ON u.id = a.author_id
    WHERE a.audience IN (${marks})
    ORDER BY a.pinned DESC, a.created_at DESC LIMIT ?`).all(...audiences, limit);
}

function feeStatus(fee) {
  if (fee.paid >= fee.amount) return 'paid';
  if (fee.paid > 0) return 'partial';
  return fee.due_date && fee.due_date < todayISO() ? 'overdue' : 'unpaid';
}

function attendanceTrend(limit = 10, classId = null) {
  const rows = classId
    ? getDb().prepare(`
        SELECT date, COUNT(*) AS total,
               SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS attended
        FROM attendance WHERE class_id = ?
        GROUP BY date ORDER BY date DESC LIMIT ?`).all(classId, limit)
    : getDb().prepare(`
        SELECT date, COUNT(*) AS total,
               SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS attended
        FROM attendance GROUP BY date ORDER BY date DESC LIMIT ?`).all(limit);
  return rows.reverse().map((r) => ({
    date: r.date,
    rate: r.total ? round1((r.attended * 100) / r.total) : 0,
    present: r.attended,
    total: r.total,
  }));
}

/* ------------------------------------------------------------------ */
/*  Route table                                                        */
/* ------------------------------------------------------------------ */

const routes = [];
function add(method, pattern, handler) {
  const keys = [];
  const rx = new RegExp(
    '^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$'
  );
  routes.push({ method, rx, keys, handler });
}

/* ---- auth ---- */

add('GET', '/api/health', () => ({ ok: true, time: new Date().toISOString() }));

add('POST', '/api/auth/login', ({ body, res }) => {
  const email = str(body.email, 200).toLowerCase();
  const password = str(body.password, 200);
  if (!email || !password) bad('Email and password are required.');
  const row = q.userByEmail.get(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  q.expiredSessions.run();
  const token = crypto.randomBytes(32).toString('hex');
  q.insertSession.run(token, row.id, `+${SESSION_DAYS} days`);
  res.setHeader('Set-Cookie',
    `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
  return { user: q.userById.get(row.id) };
});

add('POST', '/api/auth/logout', ({ req, res, user }) => {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) q.deleteSession.run(token);
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return { ok: true };
});

add('GET', '/api/auth/me', ({ user }) => ({ user }));

add('POST', '/api/auth/password', ({ user, body }) => {
  const current = str(body.current, 200);
  const next = str(body.next, 200);
  if (next.length < 6) bad('New password must be at least 6 characters.');
  const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  if (!verifyPassword(current, row.password_hash)) bad('Current password is incorrect.', 403);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  return { ok: true };
});

/* ---- printable document exports ---- */

add('POST', '/api/export', async ({ user, body }) => {
  const base64 = String(body.data || '');
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) bad('That document could not be read.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 8_000_000) bad('That document is too large to export.');
  if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') bad('Only PDF documents can be exported.');

  const token = crypto.randomBytes(18).toString('hex');
  await saveExport(`${token}.pdf`, buffer);
  const name = str(body.filename, 120).replace(/[^a-zA-Z0-9._-]+/g, '-') || 'document';
  /* Older exports are cleaned up so storage does not grow forever. */
  try {
    const files = fs.readdirSync(EXPORTS_DIR)
      .map((f) => ({ f, time: fs.statSync(path.join(EXPORTS_DIR, f)).mtimeMs }))
      .sort((a, b) => a.time - b.time);
    while (files.length > 60) {
      fs.unlinkSync(path.join(EXPORTS_DIR, files.shift().f));
    }
  } catch { /* best effort */ }
  return {
    url: `/download/${token}/${encodeURIComponent(name)}`,
    viewUrl: `/view/${token}`,
  };
});

/* ---- profile photo ---- */

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function removePhotoFile(photo) {
  if (!photo || !String(photo).startsWith('/uploads/')) return;
  await deleteUpload(path.basename(photo));
}

add('POST', '/api/profile/photo', async ({ user, body }) => {
  const raw = String(body.data || '');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!match) bad('Choose a JPEG, PNG or WebP image.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) bad('That image could not be read.');
  if (buffer.length > 1_200_000) bad('That photo is too large. Please choose one under 1 MB.');
  const ext = PHOTO_TYPES[match[1]];
  const filename = `u${user.id}-${Date.now()}.${ext}`;
  await saveUpload(filename, buffer);
  const previous = getDb().prepare('SELECT photo FROM users WHERE id = ?').get(user.id)?.photo;
  const photo = `/uploads/${filename}`;
  getDb().prepare('UPDATE users SET photo = ? WHERE id = ?').run(photo, user.id);
  await removePhotoFile(previous);
  return { photo, user: q.userById.get(user.id) };
});

add('DELETE', '/api/profile/photo', async ({ user }) => {
  const previous = getDb().prepare('SELECT photo FROM users WHERE id = ?').get(user.id)?.photo;
  getDb().prepare('UPDATE users SET photo = NULL WHERE id = ?').run(user.id);
  await removePhotoFile(previous);
  return { ok: true, user: q.userById.get(user.id) };
});

/* ---- meta ---- */

add('GET', '/api/meta', () => ({
  school: SCHOOL,
  term: TERM,
  terms: TERMS,
  assessments: ASSESSMENTS.map(([name, max]) => ({ name, max })),
  days: DAYS,
  classes: getDb().prepare(`
    SELECT c.id, c.name, c.level, c.room, c.section_id,
           sec.name AS section_name, sec.code AS section_code
    FROM classes c LEFT JOIN sections sec ON sec.id = c.section_id
    ORDER BY c.name`).all(),
  sections: getDb().prepare(`
    SELECT sec.id, sec.name, sec.code, sec.level, sec.head_teacher_id,
           sec.description, u.name AS head, u.photo AS head_photo, u.color AS head_color
    FROM sections sec
    LEFT JOIN teachers t ON t.id = sec.head_teacher_id
    LEFT JOIN users u ON u.id = t.user_id
    ORDER BY sec.name`).all(),
  subjects: getDb().prepare(`
    SELECT s.id, s.name, s.code, s.class_id, s.teacher_id, u.name AS teacher
    FROM subjects s LEFT JOIN teachers t ON t.id = s.teacher_id
    LEFT JOIN users u ON u.id = t.user_id ORDER BY s.name`).all(),
  teachers: getDb().prepare(`
    SELECT t.id, u.name, u.photo, t.specialty FROM teachers t JOIN users u ON u.id = t.user_id
    ORDER BY u.name`).all(),
  today: todayISO(),
}));

/* ---- overview ---- */

add('GET', '/api/overview', ({ user }) => {
  const announcements = announcementsFor(user.role, 4).map((a) => ({
    ...a,
    ago: timeAgo(a.created_at),
  }));

  if (user.role === 'admin') {
    const counts = {
      students: getDb().prepare('SELECT COUNT(*) n FROM students').get().n,
      teachers: getDb().prepare('SELECT COUNT(*) n FROM teachers').get().n,
      classes: getDb().prepare('SELECT COUNT(*) n FROM classes').get().n,
      subjects: getDb().prepare('SELECT COUNT(*) n FROM subjects').get().n,
    };
    const latest = getDb().prepare('SELECT MAX(date) d FROM attendance').get().d;
    const today = getDb().prepare(`
      SELECT COUNT(*) total, SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) attended,
             SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) absent,
             SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) late
      FROM attendance WHERE date = ?`).get(latest) || {};
    const fees = getDb().prepare('SELECT SUM(amount) billed, SUM(paid) paid FROM fees').get() || {};
    const performance = getDb().prepare(`
      SELECT AVG(score * 100.0 / max_score) pct FROM grades`).get() || {};
    const classRows = getDb().prepare(`
      SELECT c.id, c.name, COUNT(DISTINCT s.id) students,
             AVG(g.score * 100.0 / g.max_score) pct
      FROM classes c LEFT JOIN students s ON s.class_id = c.id
      LEFT JOIN grades g ON g.student_id = s.id
      GROUP BY c.id ORDER BY c.name`).all();
    const gender = getDb().prepare(`
      SELECT gender, COUNT(*) n FROM students GROUP BY gender`).all();
    const top = getDb().prepare(`
      SELECT s.id, u.name, u.photo, u.color, c.name AS class_name,
             SUM(g.score) * 100.0 / SUM(g.max_score) pct
      FROM students s JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      JOIN grades g ON g.student_id = s.id
      GROUP BY s.id ORDER BY pct DESC LIMIT 5`).all();
    const recentFees = getDb().prepare(`
      SELECT f.id, f.description, f.amount, f.paid, f.due_date, u.name AS student,
             c.name AS class_name
      FROM fees f JOIN students s ON s.id = f.student_id
      JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id
      WHERE f.paid < f.amount ORDER BY f.due_date ASC LIMIT 5`).all();
    const sections = getDb().prepare('SELECT id FROM sections ORDER BY name').all()
      .map((s) => sectionStats(s.id));

    return {
      role: 'admin',
      counts: { ...counts, sections: sections.length },
      sections,
      attendance: {
        date: latest,
        rate: today.total ? round1((today.attended * 100) / today.total) : null,
        present: today.attended || 0,
        absent: today.absent || 0,
        late: today.late || 0,
        total: today.total || 0,
      },
      fees: {
        billed: fees.billed || 0,
        paid: fees.paid || 0,
        balance: (fees.billed || 0) - (fees.paid || 0),
        rate: fees.billed ? round1((fees.paid * 100) / fees.billed) : 0,
      },
      average: round1(performance.pct),
      trend: attendanceTrend(10),
      classes: classRows.map((c) => ({ ...c, pct: round1(c.pct) })),
      gender,
      topStudents: top.map((t) => ({ ...t, pct: round1(t.pct) })),
      announcements,
      outstandingFees: recentFees,
    };
  }

  if (user.role === 'teacher') {
    const classes = getDb().prepare(`
      SELECT DISTINCT c.id, c.name, c.level, c.room, c.section_id,
             sec.name AS section_name, sec.code AS section_code
      FROM classes c LEFT JOIN subjects sub ON sub.class_id = c.id
      LEFT JOIN sections sec ON sec.id = c.section_id
      WHERE c.form_teacher_id = ? OR sub.teacher_id = ?
      ORDER BY c.name`).all(user.teacher_id, user.teacher_id);
    const subjects = getDb().prepare(`
      SELECT s.id, s.name, s.code, c.name AS class_name
      FROM subjects s LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.teacher_id = ? ORDER BY c.name, s.name`).all(user.teacher_id);
    const studentCount = classes.length
      ? getDb().prepare(`SELECT COUNT(*) n FROM students WHERE class_id IN (${classes.map(() => '?').join(',')})`)
        .get(...classes.map((c) => c.id)).n
      : 0;
    const latest = getDb().prepare('SELECT MAX(date) d FROM attendance').get().d;
    const today = classes.length
      ? getDb().prepare(`
          SELECT COUNT(*) total, SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) attended
          FROM attendance WHERE date = ? AND class_id IN (${classes.map(() => '?').join(',')})`)
        .get(latest, ...classes.map((c) => c.id)) || {}
      : {};
    const perf = subjects.length
      ? getDb().prepare(`
          SELECT AVG(score * 100.0 / max_score) pct FROM grades
          WHERE subject_id IN (${subjects.map(() => '?').join(',')})`)
        .get(...subjects.map((s) => s.id)) || {}
      : {};
    const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const schedule = getDb().prepare(`
      SELECT t.start_time, t.end_time, t.room, sub.name AS subject, c.name AS class_name
      FROM timetable t JOIN subjects sub ON sub.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      WHERE t.day = ? AND sub.teacher_id = ?
      ORDER BY t.start_time`).all(dow, user.teacher_id);
    const pending = getDb().prepare(`
      SELECT COUNT(*) n FROM students s
      WHERE s.class_id IN (${classes.length ? classes.map(() => '?').join(',') : 'NULL'})
        AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = s.id AND a.date = ?)`)
      .get(...classes.map((c) => c.id), latest)?.n || 0;

    return {
      role: 'teacher',
      classes,
      subjects,
      studentCount,
      attendance: {
        date: latest,
        rate: today.total ? round1((today.attended * 100) / today.total) : null,
        present: today.attended || 0,
        total: today.total || 0,
      },
      average: round1(perf.pct),
      schedule,
      pending,
      announcements,
      trend: attendanceTrend(10),
    };
  }

  /* student */
  const student = getDb().prepare(`
    SELECT s.*, u.name, u.email, u.color, u.photo, c.name AS class_name, c.room,
           c.section_id, sec.name AS section_name, sec.code AS section_code,
           u2.name AS form_teacher
    FROM students s JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN sections sec ON sec.id = c.section_id
    LEFT JOIN teachers t ON t.id = c.form_teacher_id
    LEFT JOIN users u2 ON u2.id = t.user_id
    WHERE s.id = ?`).get(user.student_id);
  if (!student) throw new HttpError(404, 'Student profile not found.');
  const summary = studentSummary(student.id);
  const grades = getDb().prepare(`
    SELECT sub.name AS subject, SUM(g.score) score, SUM(g.max_score) max
    FROM grades g JOIN subjects sub ON sub.id = g.subject_id
    WHERE g.student_id = ? GROUP BY sub.id ORDER BY sub.name`).all(student.id);
  const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const schedule = getDb().prepare(`
    SELECT t.start_time, t.end_time, t.room, sub.name AS subject, u.name AS teacher
    FROM timetable t JOIN subjects sub ON sub.id = t.subject_id
    LEFT JOIN teachers te ON te.id = sub.teacher_id LEFT JOIN users u ON u.id = te.user_id
    WHERE t.class_id = ? AND t.day = ? ORDER BY t.start_time`).all(student.class_id, dow);
  const fees = getDb().prepare(`
    SELECT * FROM fees WHERE student_id = ? ORDER BY due_date`).all(student.id)
    .map((f) => ({ ...f, status: feeStatus(f) }));
  const recent = getDb().prepare(`
    SELECT a.date, a.status FROM attendance a WHERE a.student_id = ?
    ORDER BY a.date DESC LIMIT 8`).all(student.id);
  const feeBalance = fees.reduce((n, f) => n + (f.amount - f.paid), 0);

  return {
    role: 'student',
    student,
    summary,
    subjects: grades.map((g) => ({
      subject: g.subject,
      pct: round1((g.score * 100) / g.max),
      grade: letterGrade((g.score * 100) / g.max),
    })),
    schedule,
    fees,
    feeBalance,
    recentAttendance: recent,
    announcements,
    trend: attendanceTrend(10, student.class_id),
  };
});

/* ---- students ---- */

function assertStaff(user) {
  if (user.role !== 'admin' && user.role !== 'teacher') {
    throw new HttpError(403, 'Staff access required.');
  }
}

add('GET', '/api/students', ({ user, query }) => {
  assertStaff(user);
  const where = [];
  const params = [];
  if (query.class_id) { where.push('s.class_id = ?'); params.push(num(query.class_id)); }
  if (query.q) {
    where.push('(lower(u.name) LIKE ? OR lower(s.admission_no) LIKE ?)');
    const term = `%${str(query.q, 80).toLowerCase()}%`;
    params.push(term, term);
  }
  if (query.status) { where.push('s.status = ?'); params.push(str(query.status, 20)); }
  const rows = getDb().prepare(`
    SELECT s.id, s.admission_no, s.gender, s.class_id, s.status, s.guardian_name,
           s.guardian_phone, s.user_id, u.name, u.email, u.phone, u.color, u.photo,
           c.name AS class_name
    FROM students s JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.name`).all(...params);
  return rows.map((r) => ({ ...r, ...studentSummary(r.id) }));
});

add('GET', '/api/students/:id', ({ user, params }) => {
  const id = num(params.id);
  if (user.role === 'student' && user.student_id !== id) {
    throw new HttpError(403, 'You can only view your own profile.');
  }
  const student = getDb().prepare(`
    SELECT s.*, u.name, u.email, u.phone, u.color, u.photo,
           c.name AS class_name, c.room, c.section_id,
           sec.name AS section_name, sec.code AS section_code
    FROM students s JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN sections sec ON sec.id = c.section_id
    WHERE s.id = ?`).get(id);
  if (!student) throw new HttpError(404, 'Student not found.');

  const subjectGrades = getDb().prepare(`
    SELECT sub.id, sub.name, sub.code, t.name AS teacher,
           SUM(g.score) score, SUM(g.max_score) max
    FROM grades g JOIN subjects sub ON sub.id = g.subject_id
    LEFT JOIN (SELECT te.id, u2.name FROM teachers te JOIN users u2 ON u2.id = te.user_id) t
      ON t.id = sub.teacher_id
    WHERE g.student_id = ? GROUP BY sub.id ORDER BY sub.name`).all(id)
    .map((g) => ({
      ...g,
      pct: round1((g.score * 100) / g.max),
      grade: letterGrade((g.score * 100) / g.max),
    }));

  const attendance = getDb().prepare(`
    SELECT date, status, note FROM attendance WHERE student_id = ?
    ORDER BY date DESC LIMIT 20`).all(id);

  const fees = getDb().prepare(`
    SELECT * FROM fees WHERE student_id = ? ORDER BY due_date`).all(id)
    .map((f) => ({ ...f, status: feeStatus(f) }));

  const assessmentRows = getDb().prepare(`
    SELECT g.*, sub.name AS subject FROM grades g
    JOIN subjects sub ON sub.id = g.subject_id
    WHERE g.student_id = ? ORDER BY sub.name, g.id`).all(id);

  return {
    student,
    summary: studentSummary(id),
    subjects: subjectGrades,
    attendance,
    fees,
    assessments: assessmentRows,
  };
});

add('POST', '/api/students', ({ user, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can enrol students.');
  const name = str(body.name, 120);
  const email = str(body.email, 160).toLowerCase();
  if (!name || !email) bad('Name and email are required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Enter a valid email address.');
  if (q.userByEmail.get(email)) throw new HttpError(409, 'A user with that email already exists.');
  const classId = body.class_id ? num(body.class_id) : null;
  if (classId && !getDb().prepare('SELECT 1 FROM classes WHERE id = ?').get(classId)) {
    bad('Selected class does not exist.');
  }
  const count = getDb().prepare('SELECT COUNT(*) n FROM students').get().n;
  const admissionNo = str(body.admission_no, 40) || `GA/2026/${String(count + 1).padStart(3, '0')}`;
  if (getDb().prepare('SELECT 1 FROM students WHERE admission_no = ?').get(admissionNo)) {
    throw new HttpError(409, 'That admission number is already in use.');
  }
  const password = str(body.password, 100) || 'student123';
  const color = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][count % 6];

  getDb().exec('BEGIN');
  let studentId;
  try {
    const userId = Number(getDb().prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, color)
      VALUES (?, ?, ?, 'student', ?, ?)`)
      .run(name, email, hashPassword(password), str(body.phone, 40), color).lastInsertRowid);
    studentId = Number(getDb().prepare(`
      INSERT INTO students (user_id, admission_no, class_id, gender, dob,
        guardian_name, guardian_phone, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, admissionNo, classId, str(body.gender, 10), str(body.dob, 20),
        str(body.guardian_name, 120), str(body.guardian_phone, 40), str(body.address, 300))
      .lastInsertRowid);
    getDb().exec('COMMIT');
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
  return { id: studentId, admission_no: admissionNo };
});

add('PATCH', '/api/students/:id', ({ user, params, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can edit students.');
  const id = num(params.id);
  const student = getDb().prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!student) throw new HttpError(404, 'Student not found.');
  const name = str(body.name, 120) || null;
  const email = body.email ? str(body.email, 160).toLowerCase() : null;
  if (email && email !== getDb().prepare('SELECT email FROM users WHERE id = ?').get(student.user_id).email) {
    if (q.userByEmail.get(email)) throw new HttpError(409, 'A user with that email already exists.');
  }
  getDb().exec('BEGIN');
  try {
    getDb().prepare(`
      UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone)
      WHERE id = ?`).run(name, email, body.phone === undefined ? null : str(body.phone, 40), student.user_id);
    getDb().prepare(`
      UPDATE students SET class_id = ?, gender = COALESCE(?, gender), dob = COALESCE(?, dob),
        guardian_name = COALESCE(?, guardian_name), guardian_phone = COALESCE(?, guardian_phone),
        address = COALESCE(?, address), status = COALESCE(?, status)
      WHERE id = ?`).run(
      body.class_id === undefined ? student.class_id : (body.class_id ? num(body.class_id) : null),
      body.gender === undefined ? null : str(body.gender, 10),
      body.dob === undefined ? null : str(body.dob, 20),
      body.guardian_name === undefined ? null : str(body.guardian_name, 120),
      body.guardian_phone === undefined ? null : str(body.guardian_phone, 40),
      body.address === undefined ? null : str(body.address, 300),
      body.status === undefined ? null : str(body.status, 20),
      id
    );
    getDb().exec('COMMIT');
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
});

add('DELETE', '/api/students/:id', ({ user, params }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can remove students.');
  const student = getDb().prepare('SELECT user_id FROM students WHERE id = ?').get(num(params.id));
  if (!student) throw new HttpError(404, 'Student not found.');
  getDb().prepare('DELETE FROM users WHERE id = ?').run(student.user_id);
  return { ok: true };
});

/* ---- teachers ---- */

add('GET', '/api/teachers', ({ user }) => {
  assertStaff(user);
  return getDb().prepare(`
    SELECT t.id, t.staff_no, t.specialty, t.qualification, t.hired_at,
           u.id AS user_id, u.name, u.email, u.phone, u.color, u.photo,
           (SELECT COUNT(*) FROM subjects s WHERE s.teacher_id = t.id) AS subject_count,
           (SELECT COUNT(*) FROM classes c WHERE c.form_teacher_id = t.id) AS class_count
    FROM teachers t JOIN users u ON u.id = t.user_id ORDER BY u.name`).all();
});

add('POST', '/api/teachers', ({ user, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can add teachers.');
  const name = str(body.name, 120);
  const email = str(body.email, 160).toLowerCase();
  if (!name || !email) bad('Name and email are required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Enter a valid email address.');
  if (q.userByEmail.get(email)) throw new HttpError(409, 'A user with that email already exists.');
  const count = getDb().prepare('SELECT COUNT(*) n FROM teachers').get().n;
  const password = str(body.password, 100) || 'teach123';
  getDb().exec('BEGIN');
  let id;
  try {
    const userId = Number(getDb().prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, color)
      VALUES (?, ?, ?, 'teacher', ?, ?)`)
      .run(name, email, hashPassword(password), str(body.phone, 40), '#0ea5e9').lastInsertRowid);
    id = Number(getDb().prepare(`
      INSERT INTO teachers (user_id, staff_no, specialty, qualification, hired_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run(userId, str(body.staff_no, 40) || `GA/T/${String(101 + count).padStart(3, '0')}`,
        str(body.specialty, 120), str(body.qualification, 160), str(body.hired_at, 20) || todayISO())
      .lastInsertRowid);
    getDb().exec('COMMIT');
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
  return { id };
});

add('PATCH', '/api/teachers/:id', ({ user, params, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can edit teachers.');
  const t = getDb().prepare('SELECT * FROM teachers WHERE id = ?').get(num(params.id));
  if (!t) throw new HttpError(404, 'Teacher not found.');
  getDb().exec('BEGIN');
  try {
    getDb().prepare(`
      UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone)
      WHERE id = ?`).run(str(body.name, 120) || null,
      body.email ? str(body.email, 160).toLowerCase() : null,
      body.phone === undefined ? null : str(body.phone, 40), t.user_id);
    getDb().prepare(`
      UPDATE teachers SET specialty = COALESCE(?, specialty),
        qualification = COALESCE(?, qualification), hired_at = COALESCE(?, hired_at)
      WHERE id = ?`).run(
      body.specialty === undefined ? null : str(body.specialty, 120),
      body.qualification === undefined ? null : str(body.qualification, 160),
      body.hired_at === undefined ? null : str(body.hired_at, 20), t.id);
    getDb().exec('COMMIT');
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
});

add('DELETE', '/api/teachers/:id', ({ user, params }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can remove teachers.');
  const t = getDb().prepare('SELECT user_id FROM teachers WHERE id = ?').get(num(params.id));
  if (!t) throw new HttpError(404, 'Teacher not found.');
  getDb().prepare('DELETE FROM users WHERE id = ?').run(t.user_id);
  return { ok: true };
});

/* ---- sections ---- */

function sectionStats(sectionId) {
  const section = getDb().prepare(`
    SELECT sec.*, u.name AS head, u.photo AS head_photo, u.color AS head_color,
           t.specialty AS head_specialty
    FROM sections sec
    LEFT JOIN teachers t ON t.id = sec.head_teacher_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE sec.id = ?`).get(sectionId);
  if (!section) return null;
  const classes = getDb().prepare('SELECT id FROM classes WHERE section_id = ?').all(sectionId)
    .map((c) => classStats(c.id));
  const students = getDb().prepare(`
    SELECT COUNT(*) n FROM students s JOIN classes c ON c.id = s.class_id
    WHERE c.section_id = ?`).get(sectionId).n;
  const teachers = getDb().prepare(`
    SELECT COUNT(DISTINCT sub.teacher_id) n FROM subjects sub
    JOIN classes c ON c.id = sub.class_id
    WHERE c.section_id = ? AND sub.teacher_id IS NOT NULL`).get(sectionId).n;
  const perf = getDb().prepare(`
    SELECT AVG(g.score * 100.0 / g.max_score) pct FROM grades g
    JOIN students s ON s.id = g.student_id JOIN classes c ON c.id = s.class_id
    WHERE c.section_id = ?`).get(sectionId) || {};
  const att = getDb().prepare(`
    SELECT COUNT(*) total, SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) attended
    FROM attendance a JOIN classes c ON c.id = a.class_id
    WHERE c.section_id = ?`).get(sectionId) || {};
  const fees = getDb().prepare(`
    SELECT SUM(f.amount) billed, SUM(f.paid) paid FROM fees f
    JOIN students s ON s.id = f.student_id JOIN classes c ON c.id = s.class_id
    WHERE c.section_id = ?`).get(sectionId) || {};
  return {
    ...section,
    class_count: classes.length,
    student_count: students,
    teacher_count: teachers,
    average: round1(perf.pct),
    attendanceRate: att.total ? round1((att.attended * 100) / att.total) : null,
    feeBilled: fees.billed || 0,
    feePaid: fees.paid || 0,
    feeBalance: (fees.billed || 0) - (fees.paid || 0),
  };
}

add('GET', '/api/sections', ({ user }) => {
  const ids = getDb().prepare('SELECT id FROM sections ORDER BY name').all();
  const rows = ids.map((r) => sectionStats(r.id));
  if (user.role === 'student' && user.section_name) {
    return rows.map((s) => ({ ...s, current: s.name === user.section_name }));
  }
  return rows;
});

add('GET', '/api/sections/:id', ({ user, params }) => {
  const section = sectionStats(num(params.id));
  if (!section) throw new HttpError(404, 'Section not found.');
  const classes = getDb().prepare('SELECT id FROM classes WHERE section_id = ? ORDER BY name')
    .all(section.id).map((c) => classStats(c.id));
  const teachers = getDb().prepare(`
    SELECT DISTINCT t.id, u.name, u.email, u.photo, t.specialty,
           (SELECT COUNT(*) FROM subjects sub WHERE sub.teacher_id = t.id) AS subject_count
    FROM subjects sub JOIN classes c ON c.id = sub.class_id
    JOIN teachers t ON t.id = sub.teacher_id JOIN users u ON u.id = t.user_id
    WHERE c.section_id = ? ORDER BY u.name`).all(section.id);
  const top = getDb().prepare(`
    SELECT s.id, u.name, u.photo, c.name AS class_name,
           SUM(g.score) * 100.0 / SUM(g.max_score) pct
    FROM students s JOIN users u ON u.id = s.user_id
    JOIN classes c ON c.id = s.class_id
    JOIN grades g ON g.student_id = s.id
    WHERE c.section_id = ? GROUP BY s.id ORDER BY pct DESC LIMIT 5`).all(section.id)
    .map((s) => ({ ...s, pct: round1(s.pct), grade: letterGrade(s.pct) }));
  return { section, classes, teachers, topStudents: top };
});

add('POST', '/api/sections', ({ user, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can create sections.');
  const name = str(body.name, 80);
  const code = str(body.code, 12).toUpperCase();
  if (!name) bad('Section name is required.');
  if (getDb().prepare('SELECT 1 FROM sections WHERE lower(name) = lower(?)').get(name)) {
    throw new HttpError(409, 'A section with that name already exists.');
  }
  if (code && getDb().prepare('SELECT 1 FROM sections WHERE code = ?').get(code)) {
    throw new HttpError(409, 'That section code is already in use.');
  }
  const head = body.head_teacher_id ? num(body.head_teacher_id) : null;
  if (head && !getDb().prepare('SELECT 1 FROM teachers WHERE id = ?').get(head)) {
    bad('The selected head of section does not exist.');
  }
  const id = Number(getDb().prepare(`
    INSERT INTO sections (name, code, level, head_teacher_id, description)
    VALUES (?, ?, ?, ?, ?)`)
    .run(name, code || null, str(body.level, 30) || null, head,
      str(body.description, 400)).lastInsertRowid);
  return { id };
});

add('PATCH', '/api/sections/:id', ({ user, params, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can edit sections.');
  const id = num(params.id);
  const section = getDb().prepare('SELECT * FROM sections WHERE id = ?').get(id);
  if (!section) throw new HttpError(404, 'Section not found.');
  const name = str(body.name, 80) || null;
  if (name && getDb().prepare('SELECT 1 FROM sections WHERE lower(name) = lower(?) AND id <> ?').get(name, id)) {
    throw new HttpError(409, 'A section with that name already exists.');
  }
  const code = body.code === undefined ? null : (str(body.code, 12).toUpperCase() || null);
  if (code && getDb().prepare('SELECT 1 FROM sections WHERE code = ? AND id <> ?').get(code, id)) {
    throw new HttpError(409, 'That section code is already in use.');
  }
  const head = body.head_teacher_id === undefined
    ? section.head_teacher_id
    : (body.head_teacher_id ? num(body.head_teacher_id) : null);
  if (head && !getDb().prepare('SELECT 1 FROM teachers WHERE id = ?').get(head)) {
    bad('The selected head of section does not exist.');
  }
  getDb().prepare(`
    UPDATE sections SET name = COALESCE(?, name), code = COALESCE(?, code),
      level = COALESCE(?, level), head_teacher_id = ?, description = COALESCE(?, description)
    WHERE id = ?`).run(name, code, str(body.level, 30) || null, head,
    body.description === undefined ? null : str(body.description, 400), id);
  return { ok: true };
});

add('DELETE', '/api/sections/:id', ({ user, params }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can delete sections.');
  getDb().prepare('DELETE FROM sections WHERE id = ?').run(num(params.id));
  return { ok: true };
});

/* ---- classes ---- */

add('GET', '/api/classes', ({ user }) => {
  const rows = getDb().prepare(`
    SELECT c.id, c.name, c.level, c.room, c.capacity, c.form_teacher_id,
           c.section_id, sec.name AS section_name, sec.code AS section_code,
           u.name AS form_teacher, u.photo AS form_teacher_photo
    FROM classes c
    LEFT JOIN sections sec ON sec.id = c.section_id
    LEFT JOIN teachers t ON t.id = c.form_teacher_id
    LEFT JOIN users u ON u.id = t.user_id ORDER BY c.name`).all();
  return rows.map((c) => {
    const stats = classStats(c.id);
    return {
      ...c,
      student_count: stats.student_count,
      average: stats.average,
      attendanceRate: stats.attendanceRate,
      feeBalance: stats.feeBalance,
    };
  });
});

add('POST', '/api/classes', ({ user, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can create classes.');
  const name = str(body.name, 60);
  if (!name) bad('Class name is required.');
  if (getDb().prepare('SELECT 1 FROM classes WHERE lower(name) = lower(?)').get(name)) {
    throw new HttpError(409, 'A class with that name already exists.');
  }
  const sectionId = body.section_id ? num(body.section_id) : null;
  if (sectionId && !getDb().prepare('SELECT 1 FROM sections WHERE id = ?').get(sectionId)) {
    bad('Selected section does not exist.');
  }
  const id = Number(getDb().prepare(`
    INSERT INTO classes (name, level, section_id, form_teacher_id, room, capacity) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(name, str(body.level, 30) || 'Junior', sectionId,
      body.form_teacher_id ? num(body.form_teacher_id) : null,
      str(body.room, 30), num(body.capacity, 30)).lastInsertRowid);
  return { id };
});

add('PATCH', '/api/classes/:id', ({ user, params, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can edit classes.');
  const id = num(params.id);
  const cls = getDb().prepare('SELECT * FROM classes WHERE id = ?').get(id);
  if (!cls) throw new HttpError(404, 'Class not found.');
  if (body.section_id && !getDb().prepare('SELECT 1 FROM sections WHERE id = ?').get(num(body.section_id))) {
    bad('Selected section does not exist.');
  }
  getDb().prepare(`
    UPDATE classes SET name = COALESCE(?, name), level = COALESCE(?, level),
      section_id = ?, form_teacher_id = ?, room = COALESCE(?, room), capacity = COALESCE(?, capacity)
    WHERE id = ?`).run(
    str(body.name, 60) || null, str(body.level, 30) || null,
    body.section_id === undefined
      ? cls.section_id
      : (body.section_id ? num(body.section_id) : null),
    body.form_teacher_id === undefined
      ? cls.form_teacher_id
      : (body.form_teacher_id ? num(body.form_teacher_id) : null),
    str(body.room, 30) || null,
    body.capacity === undefined ? null : num(body.capacity, 30), id);
  return { ok: true };
});

add('DELETE', '/api/classes/:id', ({ user, params }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can delete classes.');
  getDb().prepare('DELETE FROM classes WHERE id = ?').run(num(params.id));
  return { ok: true };
});

/* ---- subjects ---- */

add('GET', '/api/subjects', ({ query }) => {
  const rows = query.class_id
    ? getDb().prepare(`
        SELECT s.*, u.name AS teacher, c.name AS class_name FROM subjects s
        LEFT JOIN teachers t ON t.id = s.teacher_id LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.class_id = ? ORDER BY s.name`).all(num(query.class_id))
    : getDb().prepare(`
        SELECT s.*, u.name AS teacher, c.name AS class_name FROM subjects s
        LEFT JOIN teachers t ON t.id = s.teacher_id LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN classes c ON c.id = s.class_id
        ORDER BY c.name, s.name`).all();
  return rows;
});

add('POST', '/api/subjects', ({ user, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can create subjects.');
  const name = str(body.name, 80);
  const code = str(body.code, 20).toUpperCase();
  const classId = num(body.class_id);
  if (!name || !code || !classId) bad('Subject name, code and class are required.');
  if (getDb().prepare('SELECT 1 FROM subjects WHERE code = ?').get(code)) {
    throw new HttpError(409, 'That subject code is already in use.');
  }
  const id = Number(getDb().prepare(`
    INSERT INTO subjects (name, code, teacher_id, class_id, periods) VALUES (?, ?, ?, ?, ?)`)
    .run(name, code, body.teacher_id ? num(body.teacher_id) : null, classId,
      num(body.periods, 4)).lastInsertRowid);
  return { id };
});

add('PATCH', '/api/subjects/:id', ({ user, params, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can edit subjects.');
  const s = getDb().prepare('SELECT * FROM subjects WHERE id = ?').get(num(params.id));
  if (!s) throw new HttpError(404, 'Subject not found.');
  getDb().prepare(`
    UPDATE subjects SET name = COALESCE(?, name), teacher_id = ?, periods = COALESCE(?, periods)
    WHERE id = ?`).run(
    str(body.name, 80) || null,
    body.teacher_id === undefined ? s.teacher_id : (body.teacher_id ? num(body.teacher_id) : null),
    body.periods === undefined ? null : num(body.periods, 4), s.id);
  return { ok: true };
});

add('DELETE', '/api/subjects/:id', ({ user, params }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can delete subjects.');
  getDb().prepare('DELETE FROM subjects WHERE id = ?').run(num(params.id));
  return { ok: true };
});

/* ---- attendance ---- */

add('GET', '/api/attendance', ({ user, query }) => {
  assertStaff(user);
  const classId = num(query.class_id);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : todayISO();
  if (!classId) bad('class_id is required.');
  const cls = getDb().prepare('SELECT id, name, room FROM classes WHERE id = ?').get(classId);
  if (!cls) throw new HttpError(404, 'Class not found.');
  const rows = getDb().prepare(`
    SELECT s.id, s.admission_no, u.name, u.color, u.photo, a.status, a.note
    FROM students s JOIN users u ON u.id = s.user_id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
    WHERE s.class_id = ? ORDER BY u.name`).all(date, classId);
  const summary = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
  rows.forEach((r) => { summary[r.status || 'unmarked'] += 1; });
  return {
    class: cls, date, students: rows, summary,
    alreadyMarked: rows.some((r) => r.status),
  };
});

add('POST', '/api/attendance', ({ user, body }) => {
  assertStaff(user);
  const classId = num(body.class_id);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayISO();
  const records = Array.isArray(body.records) ? body.records : [];
  if (!classId || !records.length) bad('class_id and at least one record are required.');
  const valid = new Set(['present', 'absent', 'late', 'excused']);
  const roster = new Set(getDb().prepare('SELECT id FROM students WHERE class_id = ?')
    .all(classId).map((r) => r.id));
  const stmt = getDb().prepare(`
    INSERT INTO attendance (student_id, class_id, date, status, note, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (student_id, date) DO UPDATE SET
      status = excluded.status, note = excluded.note, recorded_by = excluded.recorded_by`);
  let saved = 0;
  getDb().exec('BEGIN');
  try {
    for (const r of records) {
      const sid = num(r.student_id);
      if (!roster.has(sid)) continue;
      const status = valid.has(r.status) ? r.status : 'present';
      stmt.run(sid, classId, date, status, str(r.note, 200), user.id);
      saved += 1;
    }
    getDb().exec('COMMIT');
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
  return { saved, date };
});

add('GET', '/api/attendance/history', ({ user, query }) => {
  assertStaff(user);
  const classId = query.class_id ? num(query.class_id) : null;
  return attendanceTrend(num(query.days, 14), classId);
});

/* ---- grades ---- */

add('GET', '/api/grades/sheet', ({ user, query }) => {
  assertStaff(user);
  const classId = num(query.class_id);
  const subjectId = num(query.subject_id);
  const term = str(query.term, 60) || TERM;
  if (!classId || !subjectId) bad('class_id and subject_id are required.');
  const subject = getDb().prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) throw new HttpError(404, 'Subject not found.');
  const students = getDb().prepare(`
    SELECT s.id, s.admission_no, u.name FROM students s JOIN users u ON u.id = s.user_id
    WHERE s.class_id = ? ORDER BY u.name`).all(classId);
  const existing = getDb().prepare(`
    SELECT g.student_id, g.assessment, g.score FROM grades g
    JOIN students s ON s.id = g.student_id
    WHERE s.class_id = ? AND g.subject_id = ? AND g.term = ?`)
    .all(classId, subjectId, term);
  const map = new Map(students.map((s) => [s.id, { student_id: s.id, scores: {} }]));
  existing.forEach((g) => {
    if (map.has(g.student_id)) map.get(g.student_id).scores[g.assessment] = g.score;
  });
  return {
    subject, class_id: classId, term,
    assessments: ASSESSMENTS.map(([name, max]) => ({ name, max })),
    students: [...map.values()],
  };
});

add('POST', '/api/grades/sheet', ({ user, body }) => {
  assertStaff(user);
  const subjectId = num(body.subject_id);
  const term = str(body.term, 60) || TERM;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!subjectId || !rows.length) bad('subject_id and rows are required.');
  const subject = getDb().prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) throw new HttpError(404, 'Subject not found.');
  const roster = new Set(getDb().prepare('SELECT id FROM students WHERE class_id = ?')
    .all(subject.class_id).map((r) => r.id));
  const stmt = getDb().prepare(`
    INSERT INTO grades (student_id, subject_id, term, assessment, score, max_score, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (student_id, subject_id, term, assessment) DO UPDATE SET
      score = excluded.score, max_score = excluded.max_score, recorded_by = excluded.recorded_by`);
  let saved = 0;
  getDb().exec('BEGIN');
  try {
    for (const row of rows) {
      const sid = num(row.student_id);
      if (!roster.has(sid) || !row.scores) continue;
      for (const [assessment, max] of ASSESSMENTS) {
        const raw = row.scores[assessment];
        if (raw === '' || raw == null) continue;
        const score = Math.max(0, Math.min(max, num(raw)));
        stmt.run(sid, subjectId, term, assessment, score, max, user.id);
        saved += 1;
      }
    }
    getDb().exec('COMMIT');
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
  return { saved };
});

add('GET', '/api/grades/student/:id', ({ user, params }) => {
  const id = num(params.id);
  if (user.role === 'student' && user.student_id !== id) {
    throw new HttpError(403, 'You can only view your own results.');
  }
  const subjects = getDb().prepare(`
    SELECT sub.id, sub.name, sub.code, SUM(g.score) score, SUM(g.max_score) max
    FROM grades g JOIN subjects sub ON sub.id = g.subject_id
    WHERE g.student_id = ? GROUP BY sub.id ORDER BY sub.name`).all(id)
    .map((s) => ({
      ...s,
      pct: round1((s.score * 100) / s.max),
      grade: letterGrade((s.score * 100) / s.max),
    }));
  const details = getDb().prepare(`
    SELECT g.id, g.assessment, g.score, g.max_score, g.term, sub.name AS subject
    FROM grades g JOIN subjects sub ON sub.id = g.subject_id
    WHERE g.student_id = ? ORDER BY sub.name, g.id`).all(id);
  const overall = subjects.length
    ? subjects.reduce((n, s) => n + s.pct, 0) / subjects.length : null;
  return {
    subjects, details,
    overall: round1(overall),
    grade: overall == null ? null : letterGrade(overall),
  };
});

add('DELETE', '/api/grades/:id', ({ user, params }) => {
  if (user.role !== 'admin' && user.role !== 'teacher') {
    throw new HttpError(403, 'Staff access required.');
  }
  getDb().prepare('DELETE FROM grades WHERE id = ?').run(num(params.id));
  return { ok: true };
});

/* ---- timetable ---- */

add('GET', '/api/timetable', ({ user, query }) => {
  let classId = query.class_id ? num(query.class_id) : null;
  let teacherId = query.mine ? user.teacher_id : null;
  if (user.role === 'student' && !classId) classId = user.class_id;
  const rows = getDb().prepare(`
    SELECT t.id, t.day, t.start_time, t.end_time, t.room,
           c.id AS class_id, c.name AS class_name,
           sub.id AS subject_id, sub.name AS subject, u.name AS teacher
    FROM timetable t JOIN classes c ON c.id = t.class_id
    JOIN subjects sub ON sub.id = t.subject_id
    LEFT JOIN teachers te ON te.id = sub.teacher_id LEFT JOIN users u ON u.id = te.user_id
    WHERE (? IS NULL OR t.class_id = ?) AND (? IS NULL OR sub.teacher_id = ?)
    ORDER BY t.start_time`).all(classId, classId, teacherId, teacherId);
  return rows;
});

add('POST', '/api/timetable', ({ user, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can edit the timetable.');
  const classId = num(body.class_id);
  const subjectId = num(body.subject_id);
  const day = str(body.day, 12);
  const start = str(body.start_time, 8);
  const end = str(body.end_time, 8);
  if (!classId || !subjectId || !DAYS.includes(day) || !start || !end) {
    bad('Class, subject, day and times are required.');
  }
  const sub = getDb().prepare('SELECT class_id FROM subjects WHERE id = ?').get(subjectId);
  if (!sub || sub.class_id !== classId) bad('That subject does not belong to the selected class.');
  const clash = getDb().prepare(`
    SELECT 1 FROM timetable WHERE class_id = ? AND day = ? AND start_time = ?`).get(classId, day, start);
  if (clash) throw new HttpError(409, 'A lesson already occupies that slot.');
  const id = Number(getDb().prepare(`
    INSERT INTO timetable (class_id, subject_id, day, start_time, end_time, room)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(classId, subjectId, day, start, end, str(body.room, 30)).lastInsertRowid);
  return { id };
});

add('DELETE', '/api/timetable/:id', ({ user, params }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can edit the timetable.');
  getDb().prepare('DELETE FROM timetable WHERE id = ?').run(num(params.id));
  return { ok: true };
});

/* ---- announcements ---- */

add('GET', '/api/announcements', ({ user, query }) => {
  const rows = announcementsFor(user.role, num(query.limit, 50));
  return rows.map((a) => ({ ...a, ago: timeAgo(a.created_at) }));
});

add('POST', '/api/announcements', ({ user, body }) => {
  if (user.role !== 'admin' && user.role !== 'teacher') {
    throw new HttpError(403, 'Staff access required.');
  }
  const title = str(body.title, 160);
  const text = str(body.body, 4000);
  if (!title || !text) bad('Title and message are required.');
  const audience = ['all', 'students', 'teachers'].includes(body.audience) ? body.audience : 'all';
  const id = Number(getDb().prepare(`
    INSERT INTO announcements (title, body, audience, author_id, pinned)
    VALUES (?, ?, ?, ?, ?)`).run(title, text, audience, user.id, bool(body.pinned)).lastInsertRowid);
  return { id };
});

add('DELETE', '/api/announcements/:id', ({ user, params }) => {
  const row = getDb().prepare('SELECT author_id FROM announcements WHERE id = ?').get(num(params.id));
  if (!row) throw new HttpError(404, 'Announcement not found.');
  if (user.role !== 'admin' && row.author_id !== user.id) {
    throw new HttpError(403, 'You can only delete your own announcements.');
  }
  getDb().prepare('DELETE FROM announcements WHERE id = ?').run(num(params.id));
  return { ok: true };
});

/* ---- fees ---- */

add('GET', '/api/fees', ({ user, query }) => {
  const where = [];
  const params = [];
  if (user.role === 'student') {
    where.push('f.student_id = ?');
    params.push(user.student_id);
  } else if (user.role === 'teacher') {
    /* teachers see the fee status of students they teach */
    where.push(`s.class_id IN (SELECT class_id FROM subjects WHERE teacher_id = ?)`);
    params.push(user.teacher_id);
  }
  if (query.class_id) { where.push('s.class_id = ?'); params.push(num(query.class_id)); }
  if (query.q) {
    where.push('(lower(u.name) LIKE ? OR lower(s.admission_no) LIKE ?)');
    const term = `%${str(query.q, 80).toLowerCase()}%`;
    params.push(term, term);
  }
  const rows = getDb().prepare(`
    SELECT f.*, u.name AS student, s.admission_no, s.id AS student_id,
           c.name AS class_name, s.class_id
    FROM fees f JOIN students s ON s.id = f.student_id
    JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.name, f.due_date`).all(...params)
    .map((f) => ({ ...f, status: feeStatus(f) }));
  const totals = rows.reduce((acc, f) => {
    acc.billed += f.amount; acc.paid += f.paid; acc.balance += f.amount - f.paid;
    return acc;
  }, { billed: 0, paid: 0, balance: 0 });
  return { fees: rows, totals };
});

add('POST', '/api/fees', ({ user, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can raise invoices.');
  const studentId = num(body.student_id);
  const description = str(body.description, 160);
  const amount = num(body.amount);
  if (!studentId || !description || amount <= 0) bad('Student, description and a positive amount are required.');
  if (!getDb().prepare('SELECT 1 FROM students WHERE id = ?').get(studentId)) {
    throw new HttpError(404, 'Student not found.');
  }
  const id = Number(getDb().prepare(`
    INSERT INTO fees (student_id, term, description, amount, paid, due_date)
    VALUES (?, ?, ?, ?, 0, ?)`)
    .run(studentId, str(body.term, 60) || TERM, description, amount, str(body.due_date, 20)).lastInsertRowid);
  return { id };
});

add('POST', '/api/fees/:id/payments', ({ user, params, body }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can record payments.');
  const fee = getDb().prepare('SELECT * FROM fees WHERE id = ?').get(num(params.id));
  if (!fee) throw new HttpError(404, 'Invoice not found.');
  const amount = num(body.amount);
  if (amount <= 0) bad('Enter a payment amount greater than zero.');
  if (amount > fee.amount - fee.paid + 0.001) bad('Payment exceeds the outstanding balance.');
  getDb().prepare('UPDATE fees SET paid = paid + ? WHERE id = ?').run(amount, fee.id);
  return { ok: true, paid: fee.paid + amount, balance: fee.amount - fee.paid - amount };
});

add('DELETE', '/api/fees/:id', ({ user, params }) => {
  if (user.role !== 'admin') throw new HttpError(403, 'Only administrators can delete invoices.');
  getDb().prepare('DELETE FROM fees WHERE id = ?').run(num(params.id));
  return { ok: true };
});

/* ---- reports ---- */

add('GET', '/api/reports/classes', ({ user }) => {
  assertStaff(user);
  return getDb().prepare('SELECT id FROM classes ORDER BY name').all()
    .map((c) => classStats(c.id));
});

add('GET', '/api/reports/class/:id', ({ user, params }) => {
  assertStaff(user);
  const id = num(params.id);
  const cls = classStats(id);
  if (!cls) throw new HttpError(404, 'Class not found.');
  const subjects = getDb().prepare(`
    SELECT sub.id, sub.name, sub.code, u.name AS teacher,
           AVG(g.score * 100.0 / g.max_score) pct, COUNT(g.id) entries
    FROM subjects sub LEFT JOIN teachers t ON t.id = sub.teacher_id
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN grades g ON g.subject_id = sub.id
    WHERE sub.class_id = ? GROUP BY sub.id ORDER BY sub.name`).all(id)
    .map((s) => ({ ...s, pct: round1(s.pct) }));
  const top = getDb().prepare(`
    SELECT s.id, u.name, SUM(g.score) * 100.0 / SUM(g.max_score) pct
    FROM students s JOIN users u ON u.id = s.user_id
    JOIN grades g ON g.student_id = s.id
    WHERE s.class_id = ? GROUP BY s.id ORDER BY pct DESC LIMIT 5`).all(id)
    .map((s) => ({ ...s, pct: round1(s.pct), grade: letterGrade(s.pct) }));
  const distribution = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0 };
  getDb().prepare(`
    SELECT g.score * 100.0 / g.max_score pct FROM grades g
    JOIN students s ON s.id = g.student_id WHERE s.class_id = ?`).all(id)
    .forEach((r) => {
      const letter = letterGrade(r.pct);
      distribution[letter.startsWith('A') ? 'A' : letter] += 1;
    });
  return {
    class: cls, subjects, topStudents: top, distribution,
    trend: attendanceTrend(10, id),
  };
});

add('GET', '/api/reports/finance', ({ user }) => {
  assertStaff(user);
  const totals = getDb().prepare(`
    SELECT SUM(amount) billed, SUM(paid) paid, SUM(amount - paid) balance FROM fees`).get();
  const byClass = getDb().prepare(`
    SELECT c.id, c.name, SUM(f.amount) billed, SUM(f.paid) paid,
           SUM(f.amount - f.paid) balance, COUNT(DISTINCT f.student_id) students
    FROM fees f JOIN students s ON s.id = f.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    GROUP BY c.id ORDER BY c.name`).all();
  const statuses = getDb().prepare(`
    SELECT SUM(CASE WHEN paid >= amount THEN 1 ELSE 0 END) paid,
           SUM(CASE WHEN paid > 0 AND paid < amount THEN 1 ELSE 0 END) partial,
           SUM(CASE WHEN paid = 0 THEN 1 ELSE 0 END) unpaid,
           COUNT(*) total
    FROM fees`).get();
  return { totals, byClass, statuses };
});

/* ------------------------------------------------------------------ */
/*  Time helper                                                        */
/* ------------------------------------------------------------------ */

function timeAgo(value) {
  const then = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  const diff = Date.now() - then.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ------------------------------------------------------------------ */
/*  Dispatcher                                                         */
/* ------------------------------------------------------------------ */

function resolveUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies.sid;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }
  if (!token) return null;
  const row = q.session.get(token);
  return row ? q.userById.get(row.id) : null;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith('/api/')) return false;

  const isPublic = pathname === '/api/health' || pathname === '/api/auth/login';
  const user = resolveUser(req);
  if (!user && !isPublic) {
    json(res, 401, { error: 'Please sign in to continue.' });
    return true;
  }

  let match = null;
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = route.rx.exec(pathname);
    if (m) {
      match = { route, m };
      break;
    }
  }
  if (!match) {
    json(res, 404, { error: `No API route for ${req.method} ${pathname}` });
    return true;
  }

  try {
    const params = {};
    match.route.keys.forEach((key, i) => { params[key] = match.m[i + 1]; });
    const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)
      ? await readBody(req) : {};
    const query = Object.fromEntries(url.searchParams.entries());
    const data = await match.route.handler({ req, res, user, body, query, params });
    if (req.method !== 'GET') {
      try { await syncDb(); } catch (err) { console.error('[api] blob sync failed', err.message); }
    }
    json(res, 200, data);
  } catch (err) {
    if (err instanceof HttpError) {
      json(res, err.status, { error: err.message, details: err.details });
    } else {
      console.error('[api]', err);
      json(res, 500, { error: 'Something went wrong on the server.' });
    }
  }
  return true;
}

module.exports = { handle, HttpError };
