import { get, post, patch, del } from '../api.js';
import { state, refresh, classes, isAdmin, isStaff, navigate } from '../store.js';
import {
  esc, icon, avatar, money, pct, dateShort, gradeBadge, attendanceBadge, feeBadge,
  pageHead, setPageMeta, emptyState, openModal, confirmDialog, formFields, toast, metricBars,
} from '../ui.js';
import { downloadPdf } from '../pdf.js?v=11';
import { buildReportCard, buildStudentList } from '../documents.js?v=11';

const filters = { q: '', class_id: '' };

function classOptions() {
  return classes().map((c) => ({ value: c.id, label: c.name }));
}

function studentFormFields(values = {}, isNew = true) {
  const fields = [
    { name: 'name', label: 'Full name', required: true, placeholder: 'e.g. Ada Okonkwo' },
    { name: 'email', label: 'Email address', type: 'email', required: true, placeholder: 'name@student.greenfield.edu.ng' },
    { name: 'admission_no', label: 'Admission number', placeholder: 'Auto-generated if blank', hint: isNew ? 'Leave blank to generate the next number.' : 'Admission numbers cannot be changed here.' },
    { name: 'class_id', label: 'Class', type: 'select', options: classOptions(), placeholder: 'Unassigned' },
    { name: 'gender', label: 'Gender', type: 'select', options: [{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }], placeholder: 'Not specified' },
    { name: 'dob', label: 'Date of birth', type: 'date' },
    { name: 'guardian_name', label: 'Parent / guardian' },
    { name: 'guardian_phone', label: 'Guardian phone', type: 'tel' },
    { name: 'phone', label: 'Student phone', type: 'tel' },
    { name: 'address', label: 'Home address', full: true },
  ];
  if (isNew) fields.push({ name: 'password', label: 'Temporary password', hint: 'Defaults to student123 if left blank.' });
  else fields.push({ name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'graduated', label: 'Graduated' }, { value: 'withdrawn', label: 'Withdrawn' }] });
  return formFields(fields, values);
}

/* ══════════════════════════════════════════════════════════
   List
   ══════════════════════════════════════════════════════════ */

function tableHtml(list) {
  if (!list.length) {
    return `<div class="table__empty">No students match your filters.</div>`;
  }
  return `<div class="table-wrap"><table class="table table--students">
    <thead><tr>
      <th>Student</th><th>Class</th><th class="hide-sm">Guardian</th>
      <th class="num hide-sm">Attendance</th><th class="num">Average</th><th class="num hide-xs">Fee balance</th>
      <th></th>
    </tr></thead>
    <tbody>${list.map((s) => `
      <tr class="row-link" data-open="${s.id}">
        <td><div class="person">${avatar(s.name, s.color, '', s.photo)}
          <div class="person__text"><strong>${esc(s.name)}</strong><span>${esc(s.admission_no)}</span></div>
        </div></td>
        <td>${s.class_name ? `<span class="badge badge--slate badge--plain">${esc(s.class_name)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="hide-sm"><div class="small">${esc(s.guardian_name || '—')}</div><div class="small muted">${esc(s.guardian_phone || '')}</div></td>
        <td class="num hide-sm">${s.attendanceRate == null ? '—' : `<span class="badge badge--${s.attendanceRate >= 90 ? 'green' : s.attendanceRate >= 75 ? 'amber' : 'red'} badge--plain">${pct(s.attendanceRate)}</span>`}</td>
        <td class="num strong">${pct(s.average, 1)}</td>
        <td class="num hide-xs">${s.feeBalance > 0 ? `<span class="strong" style="color:#b45309">${money(s.feeBalance)}</span>` : '<span class="badge badge--green badge--plain">Settled</span>'}</td>
        <td><div class="table__actions">
          <button class="icon-btn" data-open="${s.id}" title="View profile">${icon('chevronRight')}</button>
        </div></td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

async function renderList(root) {
  const query = new URLSearchParams();
  if (filters.q) query.set('q', filters.q);
  if (filters.class_id) query.set('class_id', filters.class_id);
  const list = await get('/students' + (query.toString() ? `?${query}` : ''));

  setPageMeta('Students', `${list.length} student${list.length === 1 ? '' : 's'} on record`);
  root.innerHTML = `
    ${pageHead(
    'Students',
    `${list.length} student${list.length === 1 ? '' : 's'}${filters.class_id ? ` in ${esc(classes().find((c) => String(c.id) === String(filters.class_id))?.name || '')}` : ' enrolled at Greenfield Academy'}`,
    `<button class="btn" id="print-students">${icon('printer')} Print list</button>
     <button class="btn" id="export-students">${icon('download')} Export CSV</button>
     ${isAdmin() ? `<button class="btn btn--primary" id="add-student">${icon('userPlus')} Enrol student</button>` : ''}`,
  )}

    <div class="card">
      <div class="card__body" style="padding:14px 16px">
        <div class="inline" style="gap:10px">
          <div class="field" style="flex:1;min-width:180px;max-width:340px">
            <div style="position:relative">
              <span class="field__search-icon">${icon('search')}</span>
              <input id="student-search" type="search" placeholder="Search name or admission number" value="${esc(filters.q)}"
                style="padding-left:36px">
            </div>
          </div>
          <select id="class-filter" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff;max-width:190px">
            <option value="">All classes</option>
            ${classOptions().map((c) => `<option value="${c.value}" ${String(filters.class_id) === String(c.value) ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
          <div class="spacer"></div>
          <span class="small muted">${list.length} result${list.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      ${tableHtml(list)}
    </div>`;

  const search = document.getElementById('student-search');
  let timer;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      filters.q = search.value.trim();
      refresh();
    }, 320);
  });
  document.getElementById('class-filter')?.addEventListener('change', (e) => {
    filters.class_id = e.target.value;
    refresh();
  });

  root.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`students/${el.dataset.open}`);
    });
  });

  document.getElementById('add-student')?.addEventListener('click', addStudent);
  document.getElementById('export-students')?.addEventListener('click', () => exportCsv(list));
  document.getElementById('print-students')?.addEventListener('click', () => {
    downloadPdf(buildStudentList({
      students: list,
      subtitle: filters.class_id
        ? `${classes().find((c) => String(c.id) === String(filters.class_id))?.name || 'Class'} - ${list.length} students`
        : `All classes - ${list.length} students`,
    }), 'greenfield-student-list.pdf', 'Student list ready.');
  });
}

function exportCsv(list) {
  const header = ['Admission No', 'Name', 'Class', 'Gender', 'Guardian', 'Guardian phone', 'Attendance %', 'Average %', 'Fee balance'];
  const lines = [header.join(',')];
  list.forEach((s) => {
    const row = [
      s.admission_no, s.name, s.class_name || '', s.gender || '',
      s.guardian_name || '', s.guardian_phone || '',
      s.attendanceRate ?? '', s.average ?? '', s.feeBalance ?? 0,
    ];
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'greenfield-students.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Student list exported.');
}

function addStudent() {
  openModal({
    title: 'Enrol a student',
    subtitle: 'A portal account is created automatically.',
    body: studentFormFields({}, true),
    submitLabel: 'Enrol student',
    wide: true,
    onSubmit: async (data) => {
      if (!data.name || !data.email) throw new Error('Name and email are required.');
      await post('/students', data);
      toast(`${data.name} has been enrolled.`);
      refresh();
    },
  });
}

/* ══════════════════════════════════════════════════════════
   Detail
   ══════════════════════════════════════════════════════════ */

async function renderDetail(root, id) {
  const d = await get(`/students/${id}`);
  const s = d.student;
  const sum = d.summary;
  setPageMeta(s.name, `${s.class_name || 'Unassigned'} · ${s.admission_no}`);

  root.innerHTML = `
    <div class="inline" style="margin-bottom:14px">
      <button class="btn btn--ghost btn--sm" id="back">${icon('arrowLeft')} Back to students</button>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="profile">
          ${avatar(s.name, s.color, 'xl', s.photo)}
          <div class="profile__main">
            <div class="inline" style="margin-bottom:4px">
              <h2>${esc(s.name)}</h2>
              <span class="badge badge--indigo">${esc(s.class_name || 'Unassigned')}</span>
              ${s.section_name ? `<span class="badge badge--violet">${esc(s.section_name)}</span>` : ''}
              <span class="badge badge--${s.status === 'active' ? 'green' : 'slate'}">${esc(s.status || 'active')}</span>
            </div>
            <div class="profile__meta">
              <span>${icon('file')} ${esc(s.admission_no)}</span>
              <span>${icon('mail')} ${esc(s.email)}</span>
              <span>${icon('phone')} ${esc(s.phone || s.guardian_phone || '—')}</span>
            </div>
          </div>
          <div class="page-head__actions">
            <button class="btn" id="print-report">${icon('printer')} Report card</button>
            ${isAdmin() ? `<button class="btn" id="edit-student">${icon('edit')} Edit</button>
            <button class="btn btn--danger" id="delete-student">${icon('trash')} Remove</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid--4 mt-2">
      <div class="card stat"><div class="stat__top"><span class="stat__label">Overall average</span>
        <span class="stat__icon stat__icon--indigo">${icon('percent')}</span></div>
        <div class="stat__value">${pct(sum.average, 1)}</div>
        <div class="stat__foot">${gradeBadge(sum.grade)} <span>across ${d.subjects.length} subjects</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Attendance</span>
        <span class="stat__icon stat__icon--green">${icon('attendance')}</span></div>
        <div class="stat__value">${pct(sum.attendanceRate)}</div>
        <div class="stat__foot"><span>${sum.daysPresent} present · ${sum.daysAbsent} absent</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Fee balance</span>
        <span class="stat__icon stat__icon--amber">${icon('fees')}</span></div>
        <div class="stat__value" style="font-size:23px">${money(sum.feeBalance)}</div>
        <div class="stat__foot"><span>${money(sum.feePaid)} of ${money(sum.feeBilled)} paid</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Days recorded</span>
        <span class="stat__icon stat__icon--sky">${icon('calendar')}</span></div>
        <div class="stat__value">${sum.daysRecorded}</div>
        <div class="stat__foot"><span>${esc(state.meta?.term || '')}</span></div></div>
    </div>

    <div class="grid grid--2-1 mt-2">
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Subject results</h3><p>Term aggregate per subject</p></div></div>
        ${d.subjects.length ? `<div class="table-wrap"><table class="table table--detail">
          <thead><tr><th>Subject</th><th class="hide-xs">Teacher</th><th class="num">Score</th><th class="num">Percent</th><th class="num">Grade</th></tr></thead>
          <tbody>${d.subjects.map((x) => `
            <tr><td class="strong">${esc(x.name)}</td><td class="muted hide-xs">${esc(x.teacher || '—')}</td>
              <td class="num">${x.score}/${x.max}</td><td class="num strong">${pct(x.pct, 1)}</td>
              <td class="num">${gradeBadge(x.grade)}</td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="table__empty">No results recorded yet.</div>`}
      </div>

      <div class="card">
        <div class="card__head"><div class="grow"><h3>Attendance</h3><p>Most recent records</p></div>
          <span class="badge badge--${(sum.attendanceRate || 0) >= 90 ? 'green' : 'amber'}">${pct(sum.attendanceRate)}</span></div>
        <div class="list">
          ${d.attendance.slice(0, 8).map((a) => `
            <div class="list__item" style="padding:10px 20px">
              <div class="list__text"><strong>${dateShort(a.date)}</strong>
                <span>${a.note ? esc(a.note) : '—'}</span></div>
              ${attendanceBadge(a.status)}
            </div>`).join('') || '<div class="table__empty">No attendance records.</div>'}
        </div>
      </div>
    </div>

    <div class="grid grid--2 mt-2">
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Guardian &amp; contact</h3><p>Family details on file</p></div></div>
        <div class="card__body">
          <dl class="kv">
            <dt>Guardian</dt><dd>${esc(s.guardian_name || '—')}</dd>
            <dt>Guardian phone</dt><dd>${esc(s.guardian_phone || '—')}</dd>
            <dt>Student phone</dt><dd>${esc(s.phone || '—')}</dd>
            <dt>Email</dt><dd>${esc(s.email)}</dd>
            <dt>Date of birth</dt><dd>${dateShort(s.dob)}</dd>
            <dt>Class</dt><dd>${esc(s.class_name || '—')}</dd>
            <dt>Section</dt><dd>${esc(s.section_name || '—')}</dd>
            <dt>Gender</dt><dd>${s.gender === 'F' ? 'Female' : s.gender === 'M' ? 'Male' : '—'}</dd>
            <dt>Address</dt><dd>${esc(s.address || '—')}</dd>
            <dt>Room</dt><dd>${esc(s.room || '—')}</dd>
          </dl>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div class="grow"><h3>Fees</h3><p>Invoices for this student</p></div></div>
        ${d.fees.length ? `<div class="table-wrap"><table class="table" style="min-width:480px">
          <thead><tr><th>Item</th><th class="num">Amount</th><th class="num">Paid</th><th>Status</th></tr></thead>
          <tbody>${d.fees.map((f) => `
            <tr><td><div class="strong">${esc(f.description)}</div><div class="small muted">Due ${dateShort(f.due_date)}</div></td>
              <td class="num">${money(f.amount)}</td><td class="num">${money(f.paid)}</td>
              <td>${feeBadge(f.status)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<div class="table__empty">No invoices on record.</div>'}
      </div>
    </div>

    <div class="card mt-2">
      <div class="card__head"><div class="grow"><h3>All assessments</h3><p>Every recorded score this term</p></div></div>
      ${d.assessments.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Subject</th><th>Assessment</th><th class="num">Score</th><th class="num">Out of</th><th class="num">Percent</th></tr></thead>
        <tbody>${d.assessments.map((a) => `
          <tr><td>${esc(a.subject)}</td><td>${esc(a.assessment)}</td>
            <td class="num">${a.score}</td><td class="num">${a.max_score}</td>
            <td class="num">${pct((a.score / a.max_score) * 100, 1)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="table__empty">No assessments recorded.</div>'}
    </div>`;

  document.getElementById('back')?.addEventListener('click', () => navigate(isStudentSelf(s.id) ? 'dashboard' : 'students'));
  document.getElementById('print-report')?.addEventListener('click', () => {
    downloadPdf(buildReportCard({
      student: s,
      summary: sum,
      subjects: d.subjects,
      attendance: d.attendance,
    }), `report-card-${s.admission_no.replace(/\//g, '-')}.pdf`, 'Report card ready.');
  });

  document.getElementById('edit-student')?.addEventListener('click', () => {
    openModal({
      title: `Edit ${s.name}`,
      body: studentFormFields({
        ...s,
        class_id: s.class_id || '',
        password: '',
      }, false),
      submitLabel: 'Save changes',
      wide: true,
      onSubmit: async (data) => {
        if (data.admission_no) delete data.admission_no;
        await patch(`/students/${s.id}`, data);
        toast('Student details updated.');
        refresh();
      },
    });
  });

  document.getElementById('delete-student')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Remove student',
      message: `This permanently deletes ${s.name}'s account, attendance, results and invoices. This cannot be undone.`,
      confirmLabel: 'Remove student',
    });
    if (!ok) return;
    await del(`/students/${s.id}`);
    toast('Student removed.', 'info');
    navigate('students');
  });
}

function isStudentSelf(id) {
  return state.user?.role === 'student' && Number(state.user.student_id) === Number(id);
}

export async function render(root, params) {
  if (params[0]) return renderDetail(root, params[0]);
  return renderList(root);
}
