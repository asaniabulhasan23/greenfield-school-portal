/* ============================================================
   Printable documents: report cards, registers, grade sheets,
   timetables, results, finance and section reports.
   ============================================================ */

import { PdfDoc, documentHeader, signatureRow, PAGE } from './pdf.js';
import { state } from './store.js';
import { money, pct, dateShort } from './ui.js';

const meta = () => state.meta || {};

function remark(score) {
  if (score == null) return 'No assessment has been recorded for this term yet.';
  if (score >= 85) return 'An outstanding result. Keep up the excellent work and continue to aim high.';
  if (score >= 75) return 'A very good result. A little more consistency will lift this further.';
  if (score >= 65) return 'A good result. Focus on the weaker subjects and keep working steadily.';
  if (score >= 50) return 'A fair result. More revision and practice are needed next term.';
  return 'This result needs attention. Please work closely with your teachers and parents.';
}

function gradeOf(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}

function infoBlock(doc, pairs, columns = 2) {
  const gap = 18;
  const colW = (doc.contentWidth - gap * (columns - 1)) / columns;
  let maxLines = 1;
  const perCol = Math.ceil(pairs.length / columns);
  for (let c = 0; c < columns; c += 1) {
    const startY = doc.y;
    pairs.slice(c * perCol, (c + 1) * perCol).forEach(([label, value], i) => {
      const x = doc.margin + c * (colW + gap);
      const y = startY - i * 17;
      doc.text(label.toUpperCase(), x, y, { size: 7, color: [0.47, 0.52, 0.60] });
      doc.text(value || '-', x + 78, y, { size: 9, bold: true, width: colW - 78 });
    });
    maxLines = Math.max(maxLines, perCol);
  }
  doc.y -= maxLines * 17 + 6;
  doc.line(doc.margin, doc.y, doc.margin + doc.contentWidth, doc.y, { color: [0.88, 0.90, 0.94], width: 0.6 });
  doc.y -= 10;
  return doc;
}

function summaryStrip(doc, items) {
  const gap = 8;
  const w = (doc.contentWidth - gap * (items.length - 1)) / items.length;
  const top = doc.y;
  items.forEach((item, i) => {
    const x = doc.margin + i * (w + gap);
    doc.rect(x, top - 44, w, 44, { fill: [0.965, 0.972, 0.995] });
    doc.text(item.label.toUpperCase(), x + 9, top - 13, { size: 6.8, color: [0.47, 0.52, 0.60] });
    doc.text(item.value, x + 9, top - 33, { size: 15, bold: true, color: item.color || [0.10, 0.13, 0.18] });
  });
  doc.y = top - 56;
  return doc;
}

/* ══════════════════════════════════════════════════════════
   Report card
   ══════════════════════════════════════════════════════════ */

export function buildReportCard({ student, summary, subjects, attendance = [] }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Report card' });
  documentHeader(doc, m, 'STUDENT REPORT CARD', m.term || 'Current term');

  infoBlock(doc, [
    ['Student', student.name],
    ['Admission no.', student.admission_no],
    ['Class', student.class_name || 'Unassigned'],
    ['Section', student.section_name || 'Unassigned'],
    ['Gender', student.gender === 'F' ? 'Female' : student.gender === 'M' ? 'Male' : '-'],
    ['Form teacher', student.form_teacher || '-'],
    ['Date of birth', dateShort(student.dob)],
    ['Days recorded', `${summary.daysRecorded || 0} school days`],
  ]);

  summaryStrip(doc, [
    { label: 'Overall average', value: pct(summary.average, 1), color: [0.31, 0.27, 0.90] },
    { label: 'Grade', value: summary.grade || '-' },
    { label: 'Attendance', value: pct(summary.attendanceRate), color: [0.06, 0.55, 0.40] },
    { label: 'Fee balance', value: money(summary.feeBalance), color: summary.feeBalance > 0 ? [0.71, 0.35, 0.05] : [0.06, 0.55, 0.40] },
  ]);

  doc.text('SUBJECT RESULTS', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;

  doc.table({
    columns: [
      { label: 'Subject', width: 2.2 },
      { label: 'Teacher', width: 1.8 },
      { label: 'Term score', width: 1.1, align: 'right' },
      { label: '%', width: 0.8, align: 'right' },
      { label: 'Grade', width: 0.8, align: 'center' },
    ],
    rows: subjects.length ? subjects.map((s) => [
      s.name, s.teacher || '-', `${s.score} / ${s.max}`, pct(s.pct, 1), s.grade || gradeOf(s.pct),
    ]) : [['No results recorded', '', '', '', '']],
  });

  doc.y -= 14;
  const half = (doc.contentWidth - 14) / 2;
  doc.ensure(88);
  const boxTop = doc.y;
  doc.rect(doc.margin, boxTop - 72, half, 72, { fill: [0.975, 0.98, 0.99] });
  doc.text('CLASS TEACHER REMARK', doc.margin + 10, boxTop - 15, { size: 7, color: [0.47, 0.52, 0.60] });
  doc.y = boxTop - 24;
  doc.paragraph(remark(summary.average), doc.margin + 10, { width: half - 20, size: 8.6, lineHeight: 12 });
  doc.y = boxTop;

  doc.rect(doc.margin + half + 14, boxTop - 72, half, 72, { fill: [0.975, 0.98, 0.99] });
  doc.text('ATTENDANCE THIS TERM', doc.margin + half + 24, boxTop - 15, { size: 7, color: [0.47, 0.52, 0.60] });
  doc.text(`Present: ${summary.daysPresent || 0}    Absent: ${summary.daysAbsent || 0}    Rate: ${pct(summary.attendanceRate)}`,
    doc.margin + half + 24, boxTop - 33, { size: 9 });
  doc.text(`Last records: ${attendance.slice(0, 3).map((a) => `${dateShort(a.date)} (${a.status})`).join(', ') || '-'}`,
    doc.margin + half + 24, boxTop - 47, { size: 8, color: [0.42, 0.47, 0.55], width: half - 20 });

  doc.y = boxTop - 90;
  doc.text(`Next term begins: ${m.term ? 'as published by the school office' : '-'}`, doc.margin, doc.y,
    { size: 8.6, color: [0.42, 0.47, 0.55] });
  doc.y -= 26;
  signatureRow(doc, ['Form teacher', 'Head of section', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Student report card` });
}

/* ══════════════════════════════════════════════════════════
   Attendance register
   ══════════════════════════════════════════════════════════ */

export function buildAttendanceRegister({ cls, date, students, counts }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Attendance register' });
  documentHeader(doc, m, 'DAILY ATTENDANCE REGISTER', `${cls.name} - ${dateShort(date)}`);

  infoBlock(doc, [
    ['Class', cls.name],
    ['Room', cls.room || '-'],
    ['Date', dateShort(date)],
    ['Recorded', `${students.length} students on roll`],
  ]);

  summaryStrip(doc, [
    { label: 'Present', value: String(counts.present || 0), color: [0.06, 0.55, 0.40] },
    { label: 'Absent', value: String(counts.absent || 0), color: [0.85, 0.22, 0.22] },
    { label: 'Late', value: String(counts.late || 0), color: [0.85, 0.55, 0.05] },
    { label: 'Excused', value: String(counts.excused || 0), color: [0.02, 0.55, 0.72] },
    { label: 'Unmarked', value: String(counts.unmarked || 0), color: [0.45, 0.50, 0.58] },
  ]);

  doc.table({
    columns: [
      { label: '#', width: 0.45, align: 'right' },
      { label: 'Admission no.', width: 1.2 },
      { label: 'Student', width: 2.6 },
      { label: 'Status', width: 1.1 },
      { label: 'Note', width: 1.7 },
    ],
    rows: students.map((s, i) => [
      String(i + 1), s.admission_no, s.name,
      s.status ? s.status[0].toUpperCase() + s.status.slice(1) : 'Not marked',
      s.note || '',
    ]),
  });

  doc.y -= 34;
  doc.text('Marked by: ______________________________', doc.margin, doc.y, { size: 9 });
  doc.text('Signature: ______________________________', doc.margin + doc.contentWidth - 220, doc.y, { size: 9 });
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Attendance register` });
}

/* ══════════════════════════════════════════════════════════
   Grade sheet
   ══════════════════════════════════════════════════════════ */

export function buildGradeSheet({ subject, cls, term, assessments, students }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Grade sheet' });
  documentHeader(doc, m, 'GRADE SHEET', `${subject.name} - ${cls?.name || ''} - ${term || m.term || ''}`);

  const columns = [
    { label: '#', width: 0.4, align: 'right' },
    { label: 'Admission no.', width: 1.15 },
    { label: 'Student', width: 2.2 },
    ...assessments.map((a) => ({ label: `${a.name} /${a.max}`, width: 1.15, align: 'right' })),
    { label: 'Total', width: 0.9, align: 'right' },
    { label: '%', width: 0.7, align: 'right' },
    { label: 'Grade', width: 0.7, align: 'center' },
  ];

  const rows = students.map((s, i) => {
    let score = 0;
    let max = 0;
    const cells = assessments.map((a) => {
      max += a.max;
      const value = s.scores?.[a.name];
      if (value != null && value !== '') score += Number(value);
      return value == null || value === '' ? '-' : String(value);
    });
    const percent = max ? (score * 100) / max : 0;
    return [String(i + 1), s.admission_no, s.name, ...cells,
      `${Math.round(score * 10) / 10} / ${max}`, pct(percent, 1), gradeOf(percent)];
  });

  doc.table({ columns, rows, size: 8.2, rowHeight: 20 });

  doc.y -= 34;
  doc.text('Teacher: ______________________________', doc.margin, doc.y, { size: 9 });
  doc.text('Date: ____________________', doc.margin + doc.contentWidth - 150, doc.y, { size: 9 });
  doc.y -= 22;
  signatureRow(doc, ['Subject teacher', 'Head of section', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Grade sheet` });
}

/* ══════════════════════════════════════════════════════════
   Class results
   ══════════════════════════════════════════════════════════ */

export function buildClassResults({ report, students }) {
  const m = meta();
  const cls = report.class;
  const doc = new PdfDoc({ title: 'Class results' });
  documentHeader(doc, m, 'CLASS RESULTS SUMMARY', `${cls.name} - ${m.term || ''}`);

  infoBlock(doc, [
    ['Class', cls.name],
    ['Section', cls.section_name || 'Unassigned'],
    ['Form teacher', cls.form_teacher || '-'],
    ['Room', cls.room || '-'],
    ['Students', String(cls.student_count || students.length)],
    ['Subjects', String(report.subjects.length)],
  ]);

  summaryStrip(doc, [
    { label: 'Class average', value: pct(cls.average, 1), color: [0.31, 0.27, 0.90] },
    { label: 'Attendance', value: pct(cls.attendanceRate), color: [0.06, 0.55, 0.40] },
    { label: 'Fee balance', value: money(cls.feeBalance), color: cls.feeBalance > 0 ? [0.71, 0.35, 0.05] : [0.06, 0.55, 0.40] },
    { label: 'Top average', value: report.topStudents[0] ? pct(report.topStudents[0].pct, 1) : '-' },
  ]);

  doc.text('SUBJECT AVERAGES', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: 'Subject', width: 2.4 },
      { label: 'Code', width: 0.9 },
      { label: 'Teacher', width: 2 },
      { label: 'Entries', width: 0.8, align: 'right' },
      { label: 'Average', width: 0.9, align: 'right' },
    ],
    rows: report.subjects.map((s) => [s.name, s.code, s.teacher || '-', String(s.entries || 0), pct(s.pct, 1)]),
  });

  doc.y -= 18;
  doc.text('STUDENT RANKING', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;

  const ranking = [...students].sort((a, b) => (b.average || 0) - (a.average || 0));
  doc.table({
    columns: [
      { label: '#', width: 0.45, align: 'right' },
      { label: 'Admission no.', width: 1.2 },
      { label: 'Student', width: 2.6 },
      { label: 'Attendance', width: 1, align: 'right' },
      { label: 'Average', width: 0.9, align: 'right' },
      { label: 'Grade', width: 0.7, align: 'center' },
    ],
    rows: ranking.map((s, i) => [
      String(i + 1), s.admission_no, s.name, pct(s.attendanceRate), pct(s.average, 1), s.grade || gradeOf(s.average),
    ]),
  });

  doc.y -= 30;
  signatureRow(doc, ['Form teacher', 'Head of section', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Class results` });
}

/* ══════════════════════════════════════════════════════════
   Student statement of results
   ══════════════════════════════════════════════════════════ */

export function buildStudentResults({ student, subjects, details, overall, grade }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Statement of results' });
  documentHeader(doc, m, 'STATEMENT OF RESULTS', m.term || 'Current term');

  infoBlock(doc, [
    ['Student', student.name],
    ['Admission no.', student.admission_no],
    ['Class', student.class_name || 'Unassigned'],
    ['Section', student.section_name || 'Unassigned'],
    ['Form teacher', student.form_teacher || '-'],
    ['Email', student.email || '-'],
  ]);

  summaryStrip(doc, [
    { label: 'Overall average', value: pct(overall, 1), color: [0.31, 0.27, 0.90] },
    { label: 'Grade', value: grade || '-' },
    { label: 'Subjects', value: String(subjects.length) },
    { label: 'Assessments', value: String(details.length) },
  ]);

  doc.text('SUBJECT SUMMARY', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: 'Subject', width: 2.3 },
      { label: 'Code', width: 0.8 },
      { label: 'Score', width: 1 },
      { label: '%', width: 0.8, align: 'right' },
      { label: 'Grade', width: 0.8, align: 'center' },
    ],
    rows: subjects.length ? subjects.map((s) => [
      s.name, s.code || '-', `${s.score} / ${s.max}`, pct(s.pct, 1), s.grade || gradeOf(s.pct),
    ]) : [['No results recorded', '', '', '', '']],
  });

  doc.y -= 18;
  doc.text('ASSESSMENT BREAKDOWN', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: 'Subject', width: 2 },
      { label: 'Assessment', width: 1.7 },
      { label: 'Score', width: 0.8, align: 'right' },
      { label: 'Out of', width: 0.8, align: 'right' },
      { label: '%', width: 0.8, align: 'right' },
    ],
    rows: details.length ? details.map((d) => [
      d.subject, d.assessment, String(d.score), String(d.max_score), pct((d.score / d.max_score) * 100, 1),
    ]) : [['No assessments recorded', '', '', '', '']],
    size: 8.2,
    rowHeight: 19,
  });

  doc.y -= 24;
  doc.text(`Class teacher remark: ${remark(overall)}`, doc.margin, doc.y,
    { size: 8.8, color: [0.30, 0.35, 0.43], width: doc.contentWidth });
  doc.y -= 24;
  signatureRow(doc, ['Form teacher', 'Head of section', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Statement of results` });
}

/* ══════════════════════════════════════════════════════════
   Timetable
   ══════════════════════════════════════════════════════════ */

export function buildTimetable({ rows, title = 'WEEKLY TIMETABLE', subtitle = '' }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Timetable' });
  documentHeader(doc, m, title, subtitle || m.term || '');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const times = [...new Set(rows.map((r) => r.start_time))].sort();
  const width = doc.contentWidth;
  const timeW = 58;
  const dayW = (width - timeW) / days.length;
  const rowH = 46;

  const drawHead = () => {
    doc.rect(doc.margin, doc.y - 24, width, 24, { fill: [0.945, 0.955, 0.975] });
    doc.text('TIME', doc.margin + 6, doc.y - 15, { size: 7.4, bold: true, color: [0.45, 0.50, 0.58] });
    days.forEach((d, i) => {
      doc.text(d.toUpperCase(), doc.margin + timeW + i * dayW + 5, doc.y - 15,
        { size: 7.4, bold: true, color: [0.45, 0.50, 0.58] });
    });
    doc.y -= 24;
  };

  doc.ensure(24 + rowH * 3);
  drawHead();

  times.forEach((time) => {
    if (doc.y - rowH < doc.margin + 20) {
      doc.newPage();
      doc.text('WEEKLY TIMETABLE (continued)', doc.margin, doc.y, { size: 9, bold: true, align: 'center', width });
      doc.y -= 14;
      drawHead();
    }
    const top = doc.y;
    const end = rows.find((r) => r.start_time === time)?.end_time || '';
    doc.rect(doc.margin, top - rowH, width, rowH, { stroke: [0.86, 0.89, 0.93], width: 0.5 });
    doc.rect(doc.margin, top - rowH, timeW, rowH, { fill: [0.975, 0.98, 0.995] });
    doc.text(time, doc.margin + 6, top - 17, { size: 8.2, bold: true });
    doc.text(end, doc.margin + 6, top - 29, { size: 7, color: [0.47, 0.52, 0.60] });

    days.forEach((day, i) => {
      const x = doc.margin + timeW + i * dayW;
      doc.line(x, top, x, top - rowH, { color: [0.88, 0.90, 0.94], width: 0.5 });
      const slot = rows.find((r) => r.day === day && r.start_time === time);
      if (slot) {
        const label = slot.class_name && !subtitle.includes(slot.class_name)
          ? `${slot.subject} (${slot.class_name})` : slot.subject;
        doc.text(label, x + 5, top - 17, { size: 7.8, bold: true, width: dayW - 10 });
        doc.text(slot.teacher || 'Unassigned', x + 5, top - 28, { size: 6.8, color: [0.45, 0.50, 0.58], width: dayW - 10 });
        if (slot.room) doc.text(slot.room, x + 5, top - 38, { size: 6.4, color: [0.55, 0.60, 0.67], width: dayW - 10 });
      }
    });
    doc.y = top - rowH;
  });

  doc.line(doc.margin, doc.y, doc.margin + width, doc.y, { color: [0.70, 0.74, 0.80], width: 0.8 });
  doc.y -= 22;
  doc.text(`${rows.length} lessons per week`, doc.margin, doc.y, { size: 8.6, color: [0.42, 0.47, 0.55] });
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Timetable` });
}

/* ══════════════════════════════════════════════════════════
   Finance
   ══════════════════════════════════════════════════════════ */

export function buildFinanceReport({ finance }) {
  const m = meta();
  const t = finance.totals || {};
  const s = finance.statuses || {};
  const doc = new PdfDoc({ title: 'Finance report' });
  documentHeader(doc, m, 'FINANCE REPORT', m.term || '');

  const rate = t.billed ? (t.paid / t.billed) * 100 : 0;
  summaryStrip(doc, [
    { label: 'Billed', value: money(t.billed), color: [0.31, 0.27, 0.90] },
    { label: 'Collected', value: money(t.paid), color: [0.06, 0.55, 0.40] },
    { label: 'Outstanding', value: money(t.balance), color: [0.71, 0.35, 0.05] },
    { label: 'Collection rate', value: pct(rate), color: [0.02, 0.55, 0.72] },
  ]);

  doc.text('COLLECTION BY CLASS', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: 'Class', width: 2 },
      { label: 'Students', width: 0.8, align: 'right' },
      { label: 'Billed', width: 1.1, align: 'right' },
      { label: 'Paid', width: 1.1, align: 'right' },
      { label: 'Balance', width: 1.1, align: 'right' },
      { label: 'Paid %', width: 0.8, align: 'right' },
    ],
    rows: (finance.byClass || []).map((c) => [
      c.name || 'Unassigned', String(c.students), money(c.billed), money(c.paid), money(c.balance),
      pct(c.billed ? (c.paid / c.billed) * 100 : 0),
    ]),
    size: 8.4,
  });

  doc.y -= 18;
  doc.text('INVOICE STATUS', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: 'Status', width: 2 },
      { label: 'Invoices', width: 1, align: 'right' },
      { label: 'Share', width: 1, align: 'right' },
    ],
    rows: [
      ['Paid in full', String(s.paid || 0), pct(s.total ? (s.paid / s.total) * 100 : 0)],
      ['Part paid', String(s.partial || 0), pct(s.total ? (s.partial / s.total) * 100 : 0)],
      ['Unpaid', String(s.unpaid || 0), pct(s.total ? (s.unpaid / s.total) * 100 : 0)],
      [{ cells: ['Total invoices', String(s.total || 0), '100%'], bold: true }],
    ],
  });

  doc.y -= 34;
  doc.text(`Collection rate is ${pct(rate)}. ${(t.balance || 0) > 0 ? `${money(t.balance)} remains outstanding.` : 'Every invoice is settled.'}`,
    doc.margin, doc.y, { size: 9, width: doc.contentWidth });
  doc.y -= 30;
  signatureRow(doc, ['Bursar', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Finance report` });
}

/* ══════════════════════════════════════════════════════════
   Fee statement
   ══════════════════════════════════════════════════════════ */

export function buildFeeStatement({ student, fees, summary }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Fee statement' });
  documentHeader(doc, m, 'FEE STATEMENT', m.term || '');

  infoBlock(doc, [
    ['Student', student.name],
    ['Admission no.', student.admission_no],
    ['Class', student.class_name || 'Unassigned'],
    ['Section', student.section_name || 'Unassigned'],
  ]);

  const billed = fees.reduce((sum, f) => sum + f.amount, 0);
  const paid = fees.reduce((sum, f) => sum + f.paid, 0);
  summaryStrip(doc, [
    { label: 'Billed', value: money(billed), color: [0.31, 0.27, 0.90] },
    { label: 'Paid', value: money(paid), color: [0.06, 0.55, 0.40] },
    { label: 'Balance', value: money(billed - paid), color: billed - paid > 0 ? [0.71, 0.35, 0.05] : [0.06, 0.55, 0.40] },
    { label: 'Invoices', value: String(fees.length) },
  ]);

  doc.table({
    columns: [
      { label: 'Item', width: 2.1 },
      { label: 'Term', width: 1.5 },
      { label: 'Amount', width: 1, align: 'right' },
      { label: 'Paid', width: 1, align: 'right' },
      { label: 'Balance', width: 1, align: 'right' },
      { label: 'Due', width: 0.9 },
    ],
    rows: fees.length ? fees.map((f) => [
      f.description, f.term || m.term, money(f.amount), money(f.paid), money(f.amount - f.paid), dateShort(f.due_date),
    ]) : [['No invoices on record', '', '', '', '', '']],
    size: 8.4,
  });

  doc.y -= 24;
  doc.text('Payments are recorded by the bursary. Please bring your receipt if a payment is missing from this statement.',
    doc.margin, doc.y, { size: 8.4, color: [0.42, 0.47, 0.55], width: doc.contentWidth });
  doc.y -= 30;
  signatureRow(doc, ['Bursar', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Fee statement` });
}

/* ══════════════════════════════════════════════════════════
   Section report
   ══════════════════════════════════════════════════════════ */

export function buildSectionReport({ section, classes, teachers, topStudents }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Section report' });
  documentHeader(doc, m, 'SECTION REPORT', `${section.name} - ${m.term || ''}`);

  infoBlock(doc, [
    ['Section', section.name],
    ['Code', section.code || '-'],
    ['Level', section.level || '-'],
    ['Head of section', section.head || 'Unassigned'],
  ]);

  summaryStrip(doc, [
    { label: 'Classes', value: String(section.class_count || 0) },
    { label: 'Students', value: String(section.student_count || 0), color: [0.31, 0.27, 0.90] },
    { label: 'Average', value: pct(section.average, 1), color: [0.06, 0.55, 0.40] },
    { label: 'Attendance', value: pct(section.attendanceRate), color: [0.02, 0.55, 0.72] },
    { label: 'Fee balance', value: money(section.feeBalance), color: [0.71, 0.35, 0.05] },
  ]);

  doc.text('CLASSES IN THIS SECTION', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: 'Class', width: 1.4 },
      { label: 'Form teacher', width: 2 },
      { label: 'Students', width: 0.8, align: 'right' },
      { label: 'Average', width: 0.8, align: 'right' },
      { label: 'Attendance', width: 0.9, align: 'right' },
      { label: 'Room', width: 0.8 },
    ],
    rows: classes.map((c) => [
      c.name, c.form_teacher || '-', String(c.student_count), pct(c.average, 1), pct(c.attendanceRate), c.room || '-',
    ]),
  });

  doc.y -= 16;
  doc.text('TEACHING STAFF', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: 'Teacher', width: 2.4 },
      { label: 'Speciality', width: 2 },
      { label: 'Subjects', width: 0.9, align: 'right' },
      { label: 'Email', width: 2.4 },
    ],
    rows: teachers.map((t) => [t.name, t.specialty || '-', String(t.subject_count || 0), t.email || '-']),
    size: 8.2,
  });

  doc.y -= 16;
  doc.text('TOP STUDENTS', doc.margin, doc.y, { size: 10, bold: true });
  doc.y -= 8;
  doc.table({
    columns: [
      { label: '#', width: 0.4, align: 'right' },
      { label: 'Student', width: 2.2 },
      { label: 'Class', width: 1.4 },
      { label: 'Average', width: 0.9, align: 'right' },
      { label: 'Grade', width: 0.7, align: 'center' },
    ],
    rows: topStudents.length ? topStudents.map((s, i) => [
      String(i + 1), s.name, s.class_name || '-', pct(s.pct, 1), s.grade || gradeOf(s.pct),
    ]) : [['', 'No scores recorded', '', '', '']],
  });

  doc.y -= 30;
  signatureRow(doc, ['Head of section', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Section report` });
}

/* ══════════════════════════════════════════════════════════
   Whole-school class overview
   ══════════════════════════════════════════════════════════ */

export function buildClassOverview({ list }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Class performance' });
  documentHeader(doc, m, 'CLASS PERFORMANCE REPORT', m.term || '');

  const avg = list.length ? list.reduce((n, c) => n + (c.average || 0), 0) / list.length : 0;
  const att = list.length ? list.reduce((n, c) => n + (c.attendanceRate || 0), 0) / list.length : 0;
  const students = list.reduce((n, c) => n + c.student_count, 0);
  const balance = list.reduce((n, c) => n + c.feeBalance, 0);

  summaryStrip(doc, [
    { label: 'Classes', value: String(list.length) },
    { label: 'Students', value: String(students), color: [0.31, 0.27, 0.90] },
    { label: 'Average', value: pct(avg, 1), color: [0.06, 0.55, 0.40] },
    { label: 'Attendance', value: pct(att), color: [0.02, 0.55, 0.72] },
    { label: 'Fee balance', value: money(balance), color: [0.71, 0.35, 0.05] },
  ]);

  doc.table({
    columns: [
      { label: 'Class', width: 1.4 },
      { label: 'Section', width: 1.5 },
      { label: 'Form teacher', width: 1.8 },
      { label: 'Students', width: 0.8, align: 'right' },
      { label: 'Average', width: 0.8, align: 'right' },
      { label: 'Attendance', width: 0.9, align: 'right' },
      { label: 'Fee balance', width: 1.1, align: 'right' },
    ],
    rows: list.map((c) => [
      c.name, c.section_name || '-', c.form_teacher || '-', String(c.student_count),
      pct(c.average, 1), pct(c.attendanceRate), money(c.feeBalance),
    ]),
    size: 8.2,
  });

  doc.y -= 28;
  signatureRow(doc, ['Head of academics', 'Principal']);
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Class performance` });
}

/* ══════════════════════════════════════════════════════════
   Student list
   ══════════════════════════════════════════════════════════ */

export function buildStudentList({ students, title = 'STUDENT LIST', subtitle = '' }) {
  const m = meta();
  const doc = new PdfDoc({ title: 'Student list' });
  documentHeader(doc, m, title, subtitle || m.term || '');

  doc.table({
    columns: [
      { label: '#', width: 0.4, align: 'right' },
      { label: 'Admission no.', width: 1.2 },
      { label: 'Student', width: 2.4 },
      { label: 'Class', width: 1.1 },
      { label: 'Guardian', width: 1.7 },
      { label: 'Attendance', width: 0.9, align: 'right' },
      { label: 'Average', width: 0.8, align: 'right' },
    ],
    rows: students.map((s, i) => [
      String(i + 1), s.admission_no, s.name, s.class_name || '-',
      s.guardian_name || '-', pct(s.attendanceRate), pct(s.average, 1),
    ]),
    size: 8.2,
    rowHeight: 19,
  });

  doc.y -= 26;
  doc.text(`${students.length} students`, doc.margin, doc.y, { size: 8.6, color: [0.42, 0.47, 0.55] });
  return doc.finish({ footer: `${m.school?.name || 'Greenfield Academy'} - Student list` });
}

export { PAGE };
