import { get, post } from '../api.js';
import { state, classes, subjects, refresh } from '../store.js';
import {
  esc, icon, avatar, pct, gradeBadge, pageHead, setPageMeta, emptyState, toast,
  areaChart, donut, metricBars,
} from '../ui.js';
import { downloadPdf } from '../pdf.js?v=11';
import { buildGradeSheet, buildClassResults, buildStudentResults } from '../documents.js?v=11';

const pick = { class_id: '', subject_id: '', term: '' };

function letter(p) {
  if (p >= 90) return 'A+';
  if (p >= 80) return 'A';
  if (p >= 70) return 'B';
  if (p >= 60) return 'C';
  if (p >= 50) return 'D';
  if (p >= 40) return 'E';
  return 'F';
}

/* ══════════════════════════════════════════════════════════
   Student results
   ══════════════════════════════════════════════════════════ */

async function renderStudent(root) {
  const d = await get(`/grades/student/${state.user.student_id}`);
  setPageMeta('My results', `${state.meta?.term || ''} · ${d.subjects.length} subjects`);

  const groups = {};
  d.details.forEach((row) => {
    (groups[row.subject] = groups[row.subject] || []).push(row);
  });

  root.innerHTML = `
    ${pageHead('My results', `${state.meta?.term || ''} · published by your teachers`,
    `<button class="btn" id="print-results">${icon('printer')} Print report</button>`)}

    <div class="card">
      <div class="card__body">
        <div class="inline" style="justify-content:space-between;gap:20px;flex-wrap:wrap">
          <div>
            <span class="small muted">Overall average</span>
            <div style="display:flex;align-items:baseline;gap:10px;margin-top:2px">
              <strong style="font-size:34px;letter-spacing:-.03em">${pct(d.overall, 1)}</strong>
              ${gradeBadge(d.grade)}
            </div>
            <p class="small muted" style="margin-top:4px">${d.subjects.length} subjects · ${d.details.length} assessments recorded</p>
          </div>
          <div style="min-width:240px;flex:1;max-width:420px">
            ${metricBars(d.subjects.map((s) => ({ label: s.name, value: s.pct, display: pct(s.pct, 1) })))}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid--2 mt-2">
      ${d.subjects.map((s) => {
    const rows = groups[s.name] || [];
    return `<div class="card">
        <div class="card__head">
          <div class="grow"><h3>${esc(s.name)}</h3><p>${esc(s.code)}</p></div>
          <div class="inline">${gradeBadge(s.grade)}<span class="strong">${pct(s.pct, 1)}</span></div>
        </div>
        <div class="table-wrap"><table class="table" style="min-width:0">
          <thead><tr><th>Assessment</th><th class="num">Score</th><th class="num">Out of</th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${esc(r.assessment)}</td>
            <td class="num strong">${r.score}</td>
            <td class="num muted">${r.max_score}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  }).join('') || `<div class="card">${emptyState('No results yet', 'Your teachers have not published any scores for this term.', 'grades')}</div>`}
    </div>`;

  document.getElementById('print-results')?.addEventListener('click', () => {
    const detail = get(`/students/${state.user.student_id}`);
    detail.then((data) => {
      downloadPdf(buildStudentResults({
        student: data.student,
        subjects: data.subjects,
        details: data.assessments,
        overall: d.overall,
        grade: d.grade,
      }), 'my-results.pdf', 'Statement of results ready.');
    }).catch((err) => toast(err.message, 'error'));
  });
}

/* ══════════════════════════════════════════════════════════
   Staff grade book
   ══════════════════════════════════════════════════════════ */

let tab = 'sheet';
let sheetData = null;

async function renderStaff(root) {
  const classList = classes();
  if (!classList.length) {
    root.innerHTML = `<div class="card">${emptyState('No classes', 'Create a class before entering grades.', 'classes')}</div>`;
    return;
  }
  if (!pick.class_id || !classList.some((c) => String(c.id) === String(pick.class_id))) {
    pick.class_id = classList[0].id;
  }
  const subjectList = subjects().filter((s) => String(s.class_id) === String(pick.class_id));
  if (!pick.subject_id || !subjectList.some((s) => String(s.id) === String(pick.subject_id))) {
    pick.subject_id = subjectList[0]?.id || '';
  }
  if (!pick.term) pick.term = state.meta?.term || '';

  setPageMeta('Grades', 'Enter and review assessment scores');

  root.innerHTML = `
    ${pageHead('Grades', 'Assessment scores, totals and class performance',
    `<button class="btn" id="print-grades">${icon('printer')} Print</button>`)}
    <div class="tabs">
      <button data-tab="sheet" class="${tab === 'sheet' ? 'is-active' : ''}">Enter scores</button>
      <button data-tab="results" class="${tab === 'results' ? 'is-active' : ''}">Class results</button>
    </div>
    <div id="grade-panel"></div>`;

  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
      if (tab === 'sheet') renderSheetPanel();
      else renderResultsPanel();
    });
  });

  document.getElementById('print-grades')?.addEventListener('click', async () => {
    try {
      if (tab === 'sheet') {
        if (!sheetData) return toast('Choose a class and subject first.', 'error');
        const cls = classes().find((c) => String(c.id) === String(pick.class_id));
        downloadPdf(buildGradeSheet({
          subject: sheetData.subject,
          cls,
          term: pick.term,
          assessments: sheetData.assessments,
          students: sheetData.students,
        }), `grade-sheet-${(cls?.name || 'class').replace(/\s/g, '-')}.pdf`, 'Grade sheet ready.');
        return;
      }
      const [report, studentList] = await Promise.all([
        get(`/reports/class/${pick.class_id}`),
        get(`/students?class_id=${pick.class_id}`),
      ]);
      downloadPdf(buildClassResults({ report, students: studentList }),
        `class-results-${report.class.name.replace(/\s/g, '-')}.pdf`, 'Class results ready.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  if (tab === 'sheet') renderSheetPanel();
  else renderResultsPanel();

  /* ── score entry ── */
  async function renderSheetPanel() {
    const panel = document.getElementById('grade-panel');
    const subjectListNow = subjects().filter((s) => String(s.class_id) === String(pick.class_id));

    panel.innerHTML = `
      <div class="card">
        <div class="card__body" style="padding:14px 16px">
          <div class="inline" style="gap:10px">
            <select id="g-class" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff">
              ${classList.map((c) => `<option value="${c.id}" ${String(pick.class_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
            <select id="g-subject" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff;min-width:170px">
              ${subjectListNow.map((s) => `<option value="${s.id}" ${String(pick.subject_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            </select>
            <select id="g-term" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff">
              ${(state.meta?.terms || []).map((t) => `<option ${pick.term === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
            <div class="spacer"></div>
            <button class="btn btn--primary btn--sm" id="save-grades" ${subjectListNow.length ? '' : 'disabled'}>${icon('check')} Save scores</button>
          </div>
        </div>
      </div>
      <div class="card mt-2" id="sheet-card">
        ${subjectListNow.length ? '<div class="table__empty">Loading grade book…</div>'
      : emptyState('No subjects', 'Add subjects to this class before entering grades.', 'book')}
      </div>`;

    document.getElementById('g-class')?.addEventListener('change', (e) => {
      pick.class_id = e.target.value;
      pick.subject_id = '';
      renderSheetPanel();
    });
    document.getElementById('g-subject')?.addEventListener('change', (e) => {
      pick.subject_id = e.target.value;
      loadSheet();
    });
    document.getElementById('g-term')?.addEventListener('change', (e) => {
      pick.term = e.target.value;
      loadSheet();
    });
    document.getElementById('save-grades')?.addEventListener('click', saveSheet);

    if (subjectListNow.length) await loadSheet();
  }

  async function loadSheet() {
    const card = document.getElementById('sheet-card');
    if (!card) return;
    try {
      sheetData = await get(`/grades/sheet?class_id=${pick.class_id}&subject_id=${pick.subject_id}&term=${encodeURIComponent(pick.term)}`);
      renderSheetTable();
    } catch (err) {
      card.innerHTML = `<div class="table__empty">${esc(err.message)}</div>`;
    }
  }

  function renderSheetTable() {
    const card = document.getElementById('sheet-card');
    if (!card || !sheetData) return;
    const { assessments, students, subject } = sheetData;
    if (!students.length) {
      card.innerHTML = emptyState('No students', 'This class has no students yet.', 'students');
      return;
    }
    card.innerHTML = `
      <div class="card__head">
        <div class="grow"><h3>${esc(subject.name)}</h3><p>${students.length} students · ${esc(pick.term)}</p></div>
        <span class="badge badge--slate badge--plain">Scores update totals live</span>
      </div>
      <div class="table-wrap"><table class="table" style="min-width:760px">
        <thead><tr>
          <th>Student</th>
          ${assessments.map((a) => `<th class="num">${esc(a.name)} <span class="muted">/${a.max}</span></th>`).join('')}
          <th class="num">Total</th><th class="num">Grade</th>
        </tr></thead>
        <tbody>${students.map((s) => `
          <tr data-row="${s.student_id}">
            <td><div class="person"><div class="avatar avatar--sm" style="background:#eef2ff;color:#4f46e5">${studentInitial(s)}</div>
              <div class="person__text"><strong>${esc(s.name)}</strong><span>${esc(s.admission_no)}</span></div></div></td>
            ${assessments.map((a) => `<td class="num">
              <input class="score-input" data-sid="${s.student_id}" data-assessment="${esc(a.name)}" data-max="${a.max}"
                type="number" min="0" max="${a.max}" step="0.5"
                value="${s.scores[a.name] ?? ''}" placeholder="—"
                style="width:66px;height:32px;text-align:right;border:1px solid var(--line);border-radius:7px;padding:0 8px">
            </td>`).join('')}
            <td class="num"><strong class="row-total">—</strong></td>
            <td class="num"><span class="row-grade">—</span></td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    card.querySelectorAll('.score-input').forEach((input) => {
      input.addEventListener('input', () => updateRow(input.closest('tr')));
    });
    card.querySelectorAll('tr[data-row]').forEach(updateRow);
  }

  function updateRow(tr) {
    const inputs = [...tr.querySelectorAll('.score-input')];
    let score = 0;
    let max = 0;
    inputs.forEach((i) => {
      max += Number(i.dataset.max);
      if (i.value !== '') score += Number(i.value);
    });
    const p = max ? (score / max) * 100 : 0;
    tr.querySelector('.row-total').textContent = `${score} / ${max}`;
    const gradeEl = tr.querySelector('.row-grade');
    gradeEl.innerHTML = max && inputs.some((i) => i.value !== '') ? gradeBadge(letter(p)) : '—';
  }

  async function saveSheet() {
    if (!sheetData) return;
    const rows = [];
    document.querySelectorAll('tr[data-row]').forEach((tr) => {
      const scores = {};
      tr.querySelectorAll('.score-input').forEach((i) => {
        if (i.value !== '') scores[i.dataset.assessment] = Number(i.value);
      });
      rows.push({ student_id: Number(tr.dataset.row), scores });
    });
    const btn = document.getElementById('save-grades');
    btn.disabled = true;
    try {
      const res = await post('/grades/sheet', {
        subject_id: Number(pick.subject_id), term: pick.term, rows,
      });
      toast(`${res.saved} score${res.saved === 1 ? '' : 's'} saved.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ── class results ── */
  async function renderResultsPanel() {
    const panel = document.getElementById('grade-panel');
    panel.innerHTML = '<div class="card"><div class="card__body"><div class="skeleton" style="height:220px"></div></div></div>';
    try {
      const [report, studentList] = await Promise.all([
        get(`/reports/class/${pick.class_id}`),
        get(`/students?class_id=${pick.class_id}`),
      ]);
      const dist = report.distribution || {};
      panel.innerHTML = `
        <div class="grid grid--4">
          <div class="card stat"><div class="stat__top"><span class="stat__label">Class average</span><span class="stat__icon stat__icon--indigo">${icon('percent')}</span></div>
            <div class="stat__value">${pct(report.class.average, 1)}</div><div class="stat__foot"><span>${report.class.student_count} students</span></div></div>
          <div class="card stat"><div class="stat__top"><span class="stat__label">Attendance</span><span class="stat__icon stat__icon--green">${icon('attendance')}</span></div>
            <div class="stat__value">${pct(report.class.attendanceRate)}</div><div class="stat__foot"><span>Term to date</span></div></div>
          <div class="card stat"><div class="stat__top"><span class="stat__label">Subjects</span><span class="stat__icon stat__icon--violet">${icon('book')}</span></div>
            <div class="stat__value">${report.subjects.length}</div><div class="stat__foot"><span>With recorded scores</span></div></div>
          <div class="card stat"><div class="stat__top"><span class="stat__label">Top of class</span><span class="stat__icon stat__icon--amber">${icon('grades')}</span></div>
            <div class="stat__value" style="font-size:18px">${esc(report.topStudents[0]?.name || '—')}</div>
            <div class="stat__foot"><span>${report.topStudents[0] ? pct(report.topStudents[0].pct, 1) : 'No scores'}</span></div></div>
        </div>

        <div class="grid grid--2-1 mt-2">
          <div class="card">
            <div class="card__head"><div class="grow"><h3>Subject averages</h3><p>${esc(report.class.name)}</p></div></div>
            <div class="card__body">${report.subjects.length
        ? metricBars(report.subjects.map((s) => ({ label: s.name, value: s.pct, display: pct(s.pct, 1) })))
        : emptyState('No scores', 'No grades recorded for this class yet.', 'grades')}</div>
          </div>
          <div class="card">
            <div class="card__head"><div class="grow"><h3>Grade distribution</h3><p>All assessments</p></div></div>
            <div class="card__body">
              ${donut([
        { label: 'A (80+)', value: dist.A || 0, color: '#10b981' },
        { label: 'B (70–79)', value: dist.B || 0, color: '#4f46e5' },
        { label: 'C (60–69)', value: dist.C || 0, color: '#0ea5e9' },
        { label: 'D (50–59)', value: dist.D || 0, color: '#f59e0b' },
        { label: 'E/F (below 50)', value: (dist.E || 0) + (dist.F || 0), color: '#ef4444' },
      ], { centerValue: String(report.class.student_count), centerLabel: 'students' })}
            </div>
          </div>
        </div>

        <div class="card mt-2">
          <div class="card__head"><div class="grow"><h3>Student ranking</h3><p>Overall averages for ${esc(report.class.name)}</p></div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>#</th><th>Student</th><th class="num">Attendance</th><th class="num">Average</th><th class="num">Grade</th></tr></thead>
            <tbody>${[...studentList].sort((a, b) => (b.average || 0) - (a.average || 0)).map((s, i) => `
              <tr><td class="muted">${i + 1}</td>
                <td><div class="person">${avatar(s.name, s.color, 'sm', s.photo)}<div class="person__text"><strong>${esc(s.name)}</strong><span>${esc(s.admission_no)}</span></div></div></td>
                <td class="num">${pct(s.attendanceRate)}</td>
                <td class="num strong">${pct(s.average, 1)}</td>
                <td class="num">${gradeBadge(s.grade)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>

        <div class="card mt-2">
          <div class="card__head"><div class="grow"><h3>Attendance trend</h3><p>Last 10 school days</p></div></div>
          <div class="card__body">${areaChart(report.trend || [])}</div>
        </div>`;
    } catch (err) {
      panel.innerHTML = `<div class="card"><div class="table__empty">${esc(err.message)}</div></div>`;
    }
  }
}

function studentInitial(s) {
  return String(s.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export async function render(root) {
  if (state.user.role === 'student') return renderStudent(root);
  return renderStaff(root);
}
