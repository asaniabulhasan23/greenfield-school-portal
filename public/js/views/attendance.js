import { get, post } from '../api.js';
import { state, classes, refresh } from '../store.js';
import {
  esc, icon, avatar, pct, dateShort, pageHead, setPageMeta, emptyState, toast,
  attendanceBadge, areaChart,
} from '../ui.js';
import { downloadPdf } from '../pdf.js?v=12';
import { buildAttendanceRegister } from '../documents.js?v=12';

const STATUSES = [
  ['present', 'Present'],
  ['absent', 'Absent'],
  ['late', 'Late'],
  ['excused', 'Excused'],
];

const selection = { class_id: '', date: '' };
let marks = {};
let roster = [];
let summary = {};
let activeClass = null;

/* ══════════════════════════════════════════════════════════
   Student's own attendance
   ══════════════════════════════════════════════════════════ */

async function renderStudent(root) {
  const [detail, overview] = await Promise.all([
    get(`/students/${state.user.student_id}`),
    get('/overview'),
  ]);
  const sum = detail.summary;
  setPageMeta('My attendance', `${detail.student.class_name || ''} · ${state.meta?.term || ''}`);

  root.innerHTML = `
    ${pageHead('My attendance', `Recorded by your teachers · ${state.meta?.term || ''}`)}
    <div class="grid grid--4">
      <div class="card stat"><div class="stat__top"><span class="stat__label">Attendance rate</span><span class="stat__icon stat__icon--green">${icon('attendance')}</span></div>
        <div class="stat__value">${pct(sum.attendanceRate)}</div><div class="stat__foot"><span>${sum.daysPresent} of ${sum.daysRecorded} days</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Days absent</span><span class="stat__icon stat__icon--red">${icon('calendar')}</span></div>
        <div class="stat__value">${sum.daysAbsent}</div><div class="stat__foot"><span>This term</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Days recorded</span><span class="stat__icon stat__icon--indigo">${icon('check')}</span></div>
        <div class="stat__value">${sum.daysRecorded}</div><div class="stat__foot"><span>School days so far</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Class attendance</span><span class="stat__icon stat__icon--sky">${icon('students')}</span></div>
        <div class="stat__value">${pct(overview.trend?.length ? overview.trend[overview.trend.length - 1].rate : null)}</div><div class="stat__foot"><span>${esc(detail.student.class_name || '')} latest day</span></div></div>
    </div>

    <div class="grid grid--2-1 mt-2">
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Class attendance trend</h3><p>Your class over the last 10 school days</p></div></div>
        <div class="card__body">${areaChart(overview.trend || [])}</div>
      </div>
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Recent records</h3><p>Latest 20 school days</p></div></div>
        <div class="list" style="max-height:340px;overflow-y:auto">
          ${detail.attendance.length ? detail.attendance.map((a) => `
            <div class="list__item" style="padding:10px 20px">
              <div class="list__text"><strong>${dateShort(a.date)}</strong><span>${esc(a.note || '—')}</span></div>
              ${attendanceBadge(a.status)}
            </div>`).join('') : '<div class="table__empty">No records yet.</div>'}
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   Staff register
   ══════════════════════════════════════════════════════════ */

function counts() {
  const c = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
  roster.forEach((s) => { c[marks[s.id] || 'unmarked'] += 1; });
  return c;
}

function summaryHtml() {
  const c = counts();
  return `<div class="att-summary">
    <span class="att-pill"><i style="background:#10b981"></i>Present <b>${c.present}</b></span>
    <span class="att-pill"><i style="background:#ef4444"></i>Absent <b>${c.absent}</b></span>
    <span class="att-pill"><i style="background:#f59e0b"></i>Late <b>${c.late}</b></span>
    <span class="att-pill"><i style="background:#0ea5e9"></i>Excused <b>${c.excused}</b></span>
    <span class="att-pill"><i style="background:#cbd5e1"></i>Unmarked <b>${c.unmarked}</b></span>
  </div>`;
}

function rosterHtml() {
  if (!roster.length) {
    return `<div class="table__empty">No students in this class.</div>`;
  }
  return `<div class="table-wrap"><table class="table" style="min-width:700px">
    <thead><tr><th>Student</th><th style="width:340px">Status</th></tr></thead>
    <tbody>${roster.map((s) => {
    const current = marks[s.id] || '';
    return `<tr>
        <td><div class="person">${avatar(s.name, s.color, 'sm', s.photo)}
          <div class="person__text"><strong>${esc(s.name)}</strong><span>${esc(s.admission_no)}</span></div></div></td>
        <td><div class="seg" data-sid="${s.id}">
          ${STATUSES.map(([v, l]) => `<button type="button" data-status="${v}" class="${current === v ? 'is-active' : ''}">${l}</button>`).join('')}
        </div></td>
      </tr>`;
  }).join('')}</tbody>
  </table></div>`;
}

async function renderStaff(root) {
  let list = await get('/classes');
  if (state.user.role === 'teacher') {
    try {
      const ov = await get('/overview');
      const mine = new Set((ov.classes || []).map((c) => Number(c.id)));
      const filtered = list.filter((c) => mine.has(Number(c.id)));
      if (filtered.length) list = filtered;
    } catch { /* ignore */ }
  }

  if (!selection.class_id || !list.some((c) => String(c.id) === String(selection.class_id))) {
    selection.class_id = list[0]?.id || '';
  }
  if (!selection.date) selection.date = state.meta?.today || new Date().toISOString().slice(0, 10);

  setPageMeta('Attendance', 'Mark and review daily registers');

  root.innerHTML = `
    ${pageHead('Attendance', 'Daily registers for every class',
    `<button class="btn" id="print-register">${icon('printer')} Print</button>`)}
    <div class="card">
      <div class="card__body" style="padding:14px 16px">
        <div class="inline" style="gap:10px">
          <select id="att-class" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff;min-width:150px">
            ${list.map((c) => `<option value="${c.id}" ${String(selection.class_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
          <input type="date" id="att-date" value="${esc(selection.date)}"
            style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 12px;background:#fff">
          <div class="spacer"></div>
          <button class="btn btn--sm" id="mark-all">${icon('check')} Mark all present</button>
          <button class="btn btn--primary btn--sm" id="save-register">${icon('attendance')} Save register</button>
        </div>
      </div>
    </div>

    <div class="card mt-2">
      <div class="card__head">
        <div class="grow"><h3 id="register-title">Register</h3><p id="register-sub"></p></div>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid var(--line-2)">
        <div id="att-summary">${summaryHtml()}</div>
      </div>
      <div id="roster">${rosterHtml()}</div>
    </div>

    <div class="card mt-2">
      <div class="card__head"><div class="grow"><h3>Attendance history</h3><p>Class rate over the last 14 school days</p></div></div>
      <div class="card__body" id="history">${areaChart([])}</div>
    </div>`;

  const load = async () => {
    if (!selection.class_id) {
      document.getElementById('roster').innerHTML = emptyState('No classes', 'Create a class first.', 'classes');
      return;
    }
    const data = await get(`/attendance?class_id=${selection.class_id}&date=${selection.date}`);
    roster = data.students;
    activeClass = data.class;
    marks = {};
    roster.forEach((s) => { if (s.status) marks[s.id] = s.status; });
    document.getElementById('register-title').textContent = `${data.class.name} · ${dateShort(selection.date)}`;
    document.getElementById('register-sub').textContent = data.alreadyMarked
      ? 'Register already saved — edit and save again to update.'
      : 'Not marked yet for this date.';
    document.getElementById('roster').innerHTML = rosterHtml();
    document.getElementById('att-summary').innerHTML = summaryHtml();
    bindRows();
  };

  const loadHistory = async () => {
    if (!selection.class_id) return;
    const trend = await get(`/attendance/history?class_id=${selection.class_id}&days=14`);
    document.getElementById('history').innerHTML = areaChart(trend);
  };

  const bindRows = () => {
    document.querySelectorAll('[data-seg]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          marks[seg.dataset.sid] = btn.dataset.status;
          seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
          document.getElementById('att-summary').innerHTML = summaryHtml();
        });
      });
    });
  };

  document.getElementById('att-class')?.addEventListener('change', (e) => {
    selection.class_id = e.target.value;
    load();
    loadHistory();
  });
  document.getElementById('att-date')?.addEventListener('change', (e) => {
    selection.date = e.target.value;
    load();
  });

  document.getElementById('mark-all')?.addEventListener('click', () => {
    roster.forEach((s) => { marks[s.id] = 'present'; });
    document.getElementById('roster').innerHTML = rosterHtml();
    document.getElementById('att-summary').innerHTML = summaryHtml();
    bindRows();
    toast('All students marked present. Remember to save.', 'info');
  });

  document.getElementById('save-register')?.addEventListener('click', async () => {
    if (!roster.length) return;
    const records = roster.map((s) => ({ student_id: s.id, status: marks[s.id] || 'present' }));
    const btn = document.getElementById('save-register');
    btn.disabled = true;
    try {
      const res = await post('/attendance', {
        class_id: Number(selection.class_id),
        date: selection.date,
        records,
      });
      toast(`Register saved for ${res.saved} students.`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('print-register')?.addEventListener('click', () => {
    if (!roster.length || !activeClass) return toast('Choose a class and load its register first.', 'error');
    downloadPdf(buildAttendanceRegister({
      cls: activeClass,
      date: selection.date,
      students: roster.map((s) => ({ ...s, status: marks[s.id] || s.status })),
      counts: counts(),
    }), `register-${activeClass.name.replace(/\s/g, '-')}-${selection.date}.pdf`, 'Attendance register ready.');
  });

  await load();
  await loadHistory();
}

export async function render(root) {
  if (state.user.role === 'student') return renderStudent(root);
  return renderStaff(root);
}
