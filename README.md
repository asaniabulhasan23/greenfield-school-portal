# Greenfield Academy — School Portal

A complete, full-stack school management portal: sections (each with a Head of Section),
students, teachers, classes, attendance, grades, timetable, announcements, fees and reports
— with role-based access for administrators, teachers and students. Profile photos can be
uploaded by every role, and printable documents are generated as real PDF files.

It runs on plain Node.js with **zero dependencies** (no `npm install` needed) and uses the
built-in `node:sqlite` module for storage.

---

## Quick start

```bash
cd "$HOME/School portal"
node server/index.js
```

Then open **http://127.0.0.1:4173** in a browser.

The database is created and seeded automatically on first run (`data/school.db`).
To start over with fresh demo data:

```bash
rm -rf data && node server/index.js

For existing databases, missing sections, the `photo` column and the class `section_id`
column are added automatically on boot; two demo sections (JSS and SSS) are created and
existing classes are assigned to them.
```

Other scripts:

```bash
npm start     # same as node server/index.js
npm run dev   # node --watch server/index.js (restarts on file changes)
npm run seed  # seed only, without starting the server
```

Use a different port with `PORT=8080 node server/index.js`.

---

## Demo accounts

| Role    | Email                                          | Password     |
| ------- | ---------------------------------------------- | ------------ |
| Admin   | `admin@greenfield.edu.ng`                       | `admin123`   |
| Teacher | `adaeze@greenfield.edu.ng`                      | `teach123`   |
| Student | `chidera.obi@student.greenfield.edu.ng`         | `student123` |

All seeded teachers share `teach123` and all students share `student123`.
The login screen also has one-tap demo chips for the three roles.

---

## What each role can do

### Administrator
- **Dashboard** — enrolment, staff, attendance rate, fee collection, class performance,
  gender split, top students, outstanding invoices, latest notices.
- **Students** — search and filter by class, enrol, edit, remove, open a full profile
  (results, attendance, fees, guardians, every assessment), export CSV, print report cards.
- **Teachers** — add, edit and remove staff; see subject and form-class loads and who heads
  each section.
- **Sections** — create, edit and delete sections; assign a Head of Section, see each
  section's classes, teachers, averages, attendance, fees and top students, print a
  section report.
- **Classes** — create, edit, delete, place each class in a section; per-class students,
  subjects, timetable, averages.
- **Subjects** — add subjects to a class, assign a teacher, remove subjects.
- **Attendance** — pick class + date, mark present / absent / late / excused, mark all
  present, save (re-saving updates), 14-day class trend, printable register.
- **Grades** — score sheets per class/subject with live totals and letter grades,
  class results ranking, grade distribution, subject averages.
- **Timetable** — weekly grid per class, add and remove lessons, conflict detection.
- **Announcements** — publish to everyone / students / teachers, pin, delete.
- **Fees** — raise invoices, record part payments, delete invoices, filter by class and
  status, export CSV, finance summary.
- **Reports** — class performance reports with grade spread and attendance trend, plus a
  finance report by class and invoice status. Every Print button produces a real PDF.

### Teacher
- Personal dashboard: classes, subjects, students taught, today's lessons, attendance rate,
  class average, unmarked students, announcements, section cards.
- My classes, student list and profiles, attendance registers for their classes,
  grade entry and class results, own timetable, fee status for students they teach,
  announcements for staff, read-only section pages.
- Can upload a profile photo in Settings.

### Student
- Personal dashboard: average, grade, attendance, fee balance, today's lessons,
  subject performance, recent attendance, invoices, notices, their section.
- My results (per-subject assessments, overall average, printable report).
- My attendance (rate, recent records, class trend).
- Timetable, my fees with payment progress, announcements, read-only section pages.
- Can upload a profile photo in Settings.

### Profile photos (all roles)
Settings → **Profile photo → Upload photo**. The browser crops the image to a square and
resizes it to 512 px JPEG before uploading. Photos appear on the dashboard, lists, ranks
and in the app bar. **Remove** deletes both the database reference and the stored file.

---

## Architecture

```
server/
  db.js        schema, password hashing (scrypt), school/term constants, helpers
  seed.js      deterministic demo data (20 students, 5 teachers, 2 sections, 4 classes,
               26 subjects, 30 school days of attendance, 4 assessments per subject,
               fees, timetable, announcements) + section migrations
  api.js       all JSON API routes, session auth, role checks, aggregate queries,
               photo upload and PDF export
  index.js     HTTP server, static/photo/download serving, SPA fallback, boot seeding
public/
  index.html   login screen + app shell
  css/styles.css  design system, components, responsive rules
  js/
    api.js     fetch wrapper (JSON, cookies, 401 → session-expired event)
    store.js   shared state, meta cache, hash navigation, refresh events
    ui.js      icons, formatting, modals, toasts, form builder, SVG charts
    pdf.js     zero-dependency A4 PDF writer + download helper
    documents.js report cards, registers, grade sheets, timetables, finance and
               section reports
    app.js     boot, login, sidebar nav per role, hash router, role guards
    views/     dashboard, students, teachers, classes, sections, attendance, grades,
               timetable, announcements, fees, reports, settings
data/
  school.db    SQLite database (gitignored, created on first run)
  uploads/     profile photos, served at /uploads/<file>
  exports/     generated PDFs, served as attachment downloads or inline previews
```

**Stack:** Node.js `node:http` + `node:sqlite` (`DatabaseSync`), CommonJS on the server,
vanilla ES modules on the client. No framework, no bundler, no runtime dependencies.

**Auth:** passwords are hashed with `scrypt` (random salt, timing-safe compare); sessions
are random 32-byte tokens stored in SQLite and sent as an `HttpOnly`, `SameSite=Lax`
cookie that expires after 7 days. Every API route resolves the session and enforces
role access server-side; the UI mirrors those rules.

**Database:** tables `users`, `sections`, `teachers`, `classes`, `students`, `subjects`,
`attendance`, `grades`, `timetable`, `announcements`, `fees`, `sessions`, with foreign keys,
indexes and unique constraints (attendance per student/day, grades per
student/subject/term/assessment). `sections.head_teacher_id` links a section to its Head of
Section; `classes.section_id` places a class inside a section. `users.photo` stores the
`/uploads/<file>` path.

---

## API overview

All endpoints are under `/api` and return JSON. Authentication is required except for
`GET /api/health` and `POST /api/auth/login`.

| Area          | Endpoints                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| Auth          | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` |
| Meta          | `GET /meta` (school, term, sections, classes, subjects, teachers, assessments, today) |
| Overview      | `GET /overview` (role-aware dashboard payload)                             |
| Sections      | `GET /sections`, `GET /sections/:id`, `POST /sections`, `PATCH /sections/:id`, `DELETE /sections/:id` |
| Profile photo | `POST /profile/photo`, `DELETE /profile/photo`                             |
| PDF export    | `POST /export` → `/download/<token>/<name>` (attachment), `/view/<token>` (inline) |
| Students      | `GET /students`, `GET /students/:id`, `POST /students`, `PATCH /students/:id`, `DELETE /students/:id` |
| Teachers      | `GET /teachers`, `POST /teachers`, `PATCH /teachers/:id`, `DELETE /teachers/:id` |
| Classes       | `GET /classes`, `POST /classes`, `PATCH /classes/:id`, `DELETE /classes/:id` |
| Subjects      | `GET /subjects`, `POST /subjects`, `PATCH /subjects/:id`, `DELETE /subjects/:id` |
| Attendance    | `GET /attendance?class_id&date`, `POST /attendance`, `GET /attendance/history` |
| Grades        | `GET /grades/sheet?class_id&subject_id&term`, `POST /grades/sheet`, `GET /grades/student/:id`, `DELETE /grades/:id` |
| Timetable     | `GET /timetable?class_id|mine`, `POST /timetable`, `DELETE /timetable/:id` |
| Announcements | `GET /announcements`, `POST /announcements`, `DELETE /announcements/:id` |
| Fees          | `GET /fees`, `POST /fees`, `POST /fees/:id/payments`, `DELETE /fees/:id` |
| Reports       | `GET /reports/classes`, `GET /reports/class/:id`, `GET /reports/finance` |

Errors return `{ "error": "message" }` with an appropriate HTTP status (400, 401, 403,
404, 409, 413, 500).

---

## Notes

- Demo term is **Term 1 · 2025/26**; currency is naira (₦).
- Seeded attendance covers the last 30 weekdays relative to the day the database is first
  seeded, so the dates follow the real calendar.
- **Printing:** every Print button generates a real A4 PDF in the browser (no dependency,
  no `window.print()`) and opens the device's native **Save PDF** dialog so the file is
  written to storage. If that dialog is dismissed or unavailable, a fallback dialog offers a
  **Save PDF** button and a plain download link. Documents include report cards, student
  lists, attendance registers, grade sheets, class results, timetables, fee statements,
  finance reports and section reports.
- Generated PDFs are ASCII-safe (₦ renders as `NGN`, · as `-`) because the writer embeds only
  the standard Helvetica fonts.
- The server binds `0.0.0.0:4173`, so other devices on the same network can open
  `http://<device-ip>:4173`.
