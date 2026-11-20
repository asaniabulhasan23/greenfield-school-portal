'use strict';

const {
  db, hashPassword, isSeeded, TERM, DAYS, PERIODS,
} = require('./db');

/* Deterministic pseudo-random so the demo data is stable */
let seedState = 20251119;
function rnd() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pad = (n, w = 3) => String(n).padStart(w, '0');

function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

const TEACHERS = [
  ['Adaeze Okafor', 'adaeze@greenfield.edu.ng', 'Mathematics', 'B.Sc. Mathematics, PGDE'],
  ['Kwame Mensah', 'kwame@greenfield.edu.ng', 'English Language', 'B.A. English, M.Ed.'],
  ['Fatima Bello', 'fatima@greenfield.edu.ng', 'Physics', 'B.Sc. Physics, M.Sc.'],
  ['Daniel Eze', 'daniel@greenfield.edu.ng', 'Computer Science', 'B.Sc. Computer Science'],
  ['Grace Adeyemi', 'grace@greenfield.edu.ng', 'Biology', 'B.Sc. Biology, PGDE'],
];

const CLASSES = [
  ['JSS 1A', 'Junior', 5, 'B-101', 32],
  ['JSS 2B', 'Junior', 2, 'B-102', 30],
  ['SSS 1A', 'Senior', 1, 'A-201', 28],
  ['SSS 3B', 'Senior', 3, 'A-204', 26],
];

const STUDENTS = [
  ['Chidera Obi', 'F', 0], ['Tunde Bakare', 'M', 0], ['Zainab Lawal', 'F', 0],
  ['Emeka Nwosu', 'M', 0], ['Halima Sani', 'F', 0],
  ['David Adeleke', 'M', 1], ['Ngozi Umeh', 'F', 1], ['Ibrahim Musa', 'M', 1],
  ['Blessing Ojo', 'F', 1], ['Kofi Asante', 'M', 1],
  ['Amina Garba', 'F', 2], ['Seyi Ajayi', 'M', 2], ['Chioma Eze', 'F', 2],
  ['Yusuf Danjuma', 'M', 2], ['Precious Okon', 'F', 2],
  ['Samuel Johnson', 'M', 3], ['Fatima Abubakar', 'F', 3], ['Michael Obi', 'M', 3],
  ['Grace Mensah', 'F', 3], ['Abdul Rahman', 'M', 3],
];

const GUARDIANS = ['Mr. & Mrs. Obi', 'Mrs. Bakare', 'Alhaji Lawal', 'Mr. Nwosu', 'Mrs. Sani',
  'Mr. Adeleke', 'Mrs. Umeh', 'Alhaji Musa', 'Mrs. Ojo', 'Mr. Asante',
  'Alhaji Garba', 'Mr. Ajayi', 'Mrs. Eze', 'Mr. Danjuma', 'Mrs. Okon',
  'Mr. Johnson', 'Alhaji Abubakar', 'Mrs. Obi', 'Mr. Mensah', 'Mr. Rahman'];

const JUNIOR_SUBJECTS = [
  ['Mathematics', 'MTH', 'Adaeze Okafor'],
  ['English Language', 'ENG', 'Kwame Mensah'],
  ['Basic Science', 'BSC', 'Fatima Bello'],
  ['Social Studies', 'SST', 'Grace Adeyemi'],
  ['Computer Studies', 'CST', 'Daniel Eze'],
  ['Business Studies', 'BUS', 'Adaeze Okafor'],
];

const SENIOR_SUBJECTS = [
  ['Mathematics', 'MTH', 'Adaeze Okafor'],
  ['English Language', 'ENG', 'Kwame Mensah'],
  ['Physics', 'PHY', 'Fatima Bello'],
  ['Chemistry', 'CHM', 'Fatima Bello'],
  ['Biology', 'BIO', 'Grace Adeyemi'],
  ['Computer Science', 'CSC', 'Daniel Eze'],
  ['Geography', 'GEO', 'Grace Adeyemi'],
];

const ANNOUNCEMENTS = [
  ['Mid-term break', 'School will close for the mid-term break on Friday, 28 November and reopen on Monday, 8 December. Boarding students should be picked up by 2:00 PM on Friday.', 'all', 1],
  ['Parents–Teachers meeting', 'The termly Parents–Teachers meeting holds on Saturday, 22 November at 10:00 AM in the assembly hall. Report cards will be issued after the meeting.', 'all', 0],
  ['Inter-house sports trials', 'Trials for the inter-house sports competition begin next week. Interested students should see Mr. Eze at the sports complex during break time.', 'students', 0],
  ['Staff briefing', 'There will be a short staff briefing in the conference room on Monday at 7:40 AM to review the examination timetable.', 'teachers', 0],
  ['Library extended hours', 'The library will stay open until 5:00 PM on weekdays throughout the examination period. Please observe silence.', 'students', 0],
];

function seed() {
  if (isSeeded()) return false;

  const today = isoToday();
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, phone, color) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertTeacher = db.prepare(
    'INSERT INTO teachers (user_id, staff_no, specialty, qualification, hired_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertClass = db.prepare(
    'INSERT INTO classes (name, level, section_id, form_teacher_id, room, capacity) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertSection = db.prepare(
    'INSERT INTO sections (name, code, level, head_teacher_id, description) VALUES (?, ?, ?, ?, ?)'
  );
  const insertStudent = db.prepare(
    `INSERT INTO students (user_id, admission_no, class_id, gender, dob, guardian_name, guardian_phone, address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSubject = db.prepare(
    'INSERT INTO subjects (name, code, teacher_id, class_id, periods) VALUES (?, ?, ?, ?, ?)'
  );
  const insertSlot = db.prepare(
    'INSERT INTO timetable (class_id, subject_id, day, start_time, end_time, room) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertAttendance = db.prepare(
    'INSERT INTO attendance (student_id, class_id, date, status, recorded_by) VALUES (?, ?, ?, ?, ?)'
  );
  const insertGrade = db.prepare(
    `INSERT INTO grades (student_id, subject_id, term, assessment, score, max_score, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertFee = db.prepare(
    'INSERT INTO fees (student_id, term, description, amount, paid, due_date) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertAnnouncement = db.prepare(
    'INSERT INTO announcements (title, body, audience, author_id, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  db.exec('BEGIN');
  try {
    /* ---- admin ---- */
    const adminId = Number(insertUser.run(
      'Dr. Amina Yusuf', 'admin@greenfield.edu.ng', hashPassword('admin123'),
      'admin', '+234 803 555 0100', '#0f766e'
    ).lastInsertRowid);

    /* ---- teachers ---- */
    const teacherIds = {};
    TEACHERS.forEach(([name, email, specialty, qualification], i) => {
      const uid = Number(insertUser.run(
        name, email, hashPassword('teach123'), 'teacher',
        `+234 80${int(3, 9)} ${int(100, 999)} ${int(1000, 9999)}`, COLORS[i % COLORS.length]
      ).lastInsertRowid);
      const tid = Number(insertTeacher.run(
        uid, `GA/T/${pad(101 + i)}`, specialty, qualification,
        `${2015 + i}-09-01`
      ).lastInsertRowid);
      teacherIds[name] = { userId: uid, teacherId: tid };
    });

    /* ---- sections ---- */
    const sectionIds = {};
    [
      ['Junior Secondary', 'JSS', 'Junior', 'Kwame Mensah',
        'JSS 1–3 · foundational secondary education'],
      ['Senior Secondary', 'SSS', 'Senior', 'Adaeze Okafor',
        'SSS 1–3 · WAEC and NECO preparation'],
    ].forEach(([name, code, level, head, description]) => {
      sectionIds[level] = Number(insertSection.run(
        name, code, level, teacherIds[head].teacherId, description
      ).lastInsertRowid);
    });

    /* ---- classes ---- */
    const classIds = [];
    CLASSES.forEach(([name, level, teacherIdx, room, capacity]) => {
      const t = Object.values(teacherIds)[teacherIdx - 1];
      const id = Number(insertClass.run(
        name, level, sectionIds[level], t.teacherId, room, capacity
      ).lastInsertRowid);
      classIds.push({ id, name, room, level });
    });

    /* ---- students ---- */
    const studentRows = [];
    STUDENTS.forEach(([name, gender, classIdx], i) => {
      const email = name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.') + '@student.greenfield.edu.ng';
      const uid = Number(insertUser.run(
        name, email, hashPassword('student123'), 'student',
        `+234 81${int(0, 9)} ${int(100, 999)} ${int(1000, 9999)}`, COLORS[(i + 3) % COLORS.length]
      ).lastInsertRowid);
      const cls = classIds[classIdx];
      const id = Number(insertStudent.run(
        uid, `GA/2025/${pad(i + 1)}`, cls.id, gender,
        `${2007 + int(0, 5)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
        GUARDIANS[i], `+234 70${int(0, 9)} ${int(100, 999)} ${int(1000, 9999)}`,
        `${int(1, 60)} ${pick(['Palm', 'Oak', 'Cedar', 'Maple', 'Iroko'])} Street, ${pick(['Ikeja', 'Surulere', 'Yaba', 'Lekki', 'Gbagada'])}`
      ).lastInsertRowid);
      studentRows.push({
        id, userId: uid, classId: cls.id, name, gender,
        ability: 0.55 + rnd() * 0.42,
      });
    });

    /* ---- subjects + timetable ---- */
    classIds.forEach((cls, ci) => {
      const list = cls.level === 'Junior' ? JUNIOR_SUBJECTS : SENIOR_SUBJECTS;
      const subjectIds = [];
      list.forEach(([name, code, teacherName]) => {
        const t = teacherIds[teacherName];
        const id = Number(insertSubject.run(
          name, `${code}-${cls.name.replace(/\s/g, '')}`, t.teacherId, cls.id, 4
        ).lastInsertRowid);
        subjectIds.push(id);
      });

      /* rotate subjects so no class repeats a subject twice in a day where possible */
      DAYS.forEach((day, di) => {
        PERIODS.forEach(([start, end], pi) => {
          const idx = (ci * 2 + di * 3 + pi) % subjectIds.length;
          insertSlot.run(cls.id, subjectIds[idx], day, start, end, cls.room);
        });
      });
    });

    /* ---- attendance: last 30 weekdays ---- */
    const dates = [];
    let cursor = today;
    while (dates.length < 30) {
      const dow = new Date(cursor + 'T12:00:00').getDay();
      if (dow !== 0 && dow !== 6) dates.push(cursor);
      cursor = addDays(cursor, -1);
    }

    studentRows.forEach((s) => {
      dates.forEach((date) => {
        const r = rnd();
        let status = 'present';
        if (r > 0.965) status = 'absent';
        else if (r > 0.925) status = 'late';
        else if (r > 0.9) status = 'excused';
        insertAttendance.run(s.id, s.classId, date, status, adminId);
      });
    });

    /* ---- grades ---- */
    const assessments = [
      ['Quiz 1', 20], ['Assignment', 20], ['Mid-term Test', 30], ['Examination', 30],
    ];
    const subjectsByClass = db.prepare('SELECT id, class_id FROM subjects').all();
    studentRows.forEach((s) => {
      const subjects = subjectsByClass.filter((x) => x.class_id === s.classId);
      subjects.forEach((sub) => {
        assessments.forEach(([label, max]) => {
          const noise = (rnd() - 0.5) * 0.18;
          const pct = Math.min(0.99, Math.max(0.28, s.ability + noise));
          insertGrade.run(s.id, sub.id, TERM, label, Math.round(pct * max * 10) / 10, max, adminId);
        });
      });
    });

    /* ---- fees ---- */
    studentRows.forEach((s, i) => {
      const plan = i % 4; // 0 fully paid, 1 partial, 2 partial, 3 unpaid
      const items = [
        ['Tuition fee', 120000],
        ['Books & materials', 18500],
        ['Transport (term)', 15000],
      ];
      items.forEach(([desc, amount], k) => {
        let paid = 0;
        if (plan === 0) paid = amount;
        else if (plan === 1) paid = k === 0 ? amount : 0;
        else if (plan === 2) paid = Math.round(amount * (0.3 + rnd() * 0.4));
        insertFee.run(s.id, TERM, desc, amount, paid, addDays(today, 14 + k * 7));
      });
    });

    /* ---- announcements ---- */
    ANNOUNCEMENTS.forEach(([title, body, audience, pinned], i) => {
      insertAnnouncement.run(
        title, body, audience, adminId, pinned,
        new Date(Date.now() - i * 36 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
      );
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return true;
}

if (require.main === module) {
  const created = seed();
  const sections = ensureSections();
  console.log(created ? 'Database seeded.' : 'Database already contains data — nothing to do.');
  if (sections) console.log('Sections created and classes assigned.');
}

/* Older databases were seeded before sections existed. Create the two demo
   sections and attach existing classes to them. */
function ensureSections() {
  const count = db.prepare('SELECT COUNT(*) n FROM sections').get().n;
  if (count) {
    db.prepare(`UPDATE classes SET section_id = (SELECT id FROM sections WHERE code = 'JSS')
      WHERE section_id IS NULL AND name LIKE 'JSS%'`).run();
    db.prepare(`UPDATE classes SET section_id = (SELECT id FROM sections WHERE code = 'SSS')
      WHERE section_id IS NULL AND name LIKE 'SSS%'`).run();
    return false;
  }
  const findTeacher = db.prepare(`
    SELECT t.id FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.name = ?`);
  const insert = db.prepare(`
    INSERT INTO sections (name, code, level, head_teacher_id, description)
    VALUES (?, ?, ?, ?, ?)`);
  const junior = Number(insert.run(
    'Junior Secondary', 'JSS', 'Junior', findTeacher.get('Kwame Mensah')?.id || null,
    'JSS 1–3 · foundational secondary education'
  ).lastInsertRowid);
  const senior = Number(insert.run(
    'Senior Secondary', 'SSS', 'Senior', findTeacher.get('Adaeze Okafor')?.id || null,
    'SSS 1–3 · WAEC and NECO preparation'
  ).lastInsertRowid);
  db.prepare("UPDATE classes SET section_id = ? WHERE name LIKE 'JSS%'").run(junior);
  db.prepare("UPDATE classes SET section_id = ? WHERE name LIKE 'SSS%'").run(senior);
  return true;
}

module.exports = { seed, ensureSections };
