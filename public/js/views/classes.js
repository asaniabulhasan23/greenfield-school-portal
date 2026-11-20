import { get, post, patch, del } from '../api.js';
import { state, refresh, isAdmin, navigate, teachers, sections } from '../store.js';
import {
  esc, icon, avatar, money, pct, pageHead, setPageMeta, emptyState, openModal,
  confirmDialog, formFields, toast,
} from '../ui.js';

function hashQuery() {
  const raw = location.hash.split('?')[1] || '';
  return new URLSearchParams(raw);
}

function classForm(v = {}) {
  return formFields([
    { name: 'name', label: 'Class name', required: true, placeholder: 'e.g. JSS 3A' },
    { name: 'section_id', label: 'Section', type: 'select', options: sections().map((s) => ({ value: s.id, label: `${s.name} (${s.code || s.level})` })), placeholder: 'Unassigned' },
    { name: 'level', label: 'Level', type: 'select', options: [{ value: 'Junior', label: 'Junior secondary' }, { value: 'Senior', label: 'Senior secondary' }] },
    { name: 'form_teacher_id', label: 'Form teacher', type: 'select', options: teachers().map((t) => ({ value: t.id, label: t.name })), placeholder: 'Unassigned' },
    { name: 'room', label: 'Room', placeholder: 'e.g. B-104' },
    { name: 'capacity', label: 'Capacity', type: 'number', min: 1, max: 80 },
  ], v);
}

export async function render(root) {
  const classId = hashQuery().get('class');
  if (classId) return renderDetail(root, classId);
  return renderList(root);
}

/* ══════════════════════════════════════════════════════════
   List
   ══════════════════════════════════════════════════════════ */

function classCard(c) {
  const fill = c.capacity ? Math.min(100, Math.round((c.student_count / c.capacity) * 100)) : 0;
  return `<div class="card row-link" data-class="${c.id}" style="cursor:pointer">
    <div class="card__body">
      <div class="inline" style="justify-content:space-between;align-items:flex-start">
        <div>
          <div class="inline" style="margin-bottom:4px">
            <h3 style="font-size:17px;letter-spacing:-.02em">${esc(c.name)}</h3>
            <span class="badge badge--${c.level === 'Senior' ? 'indigo' : 'sky'}">${esc(c.level)}</span>
          </div>
          <p class="muted small">${esc(c.form_teacher || 'No form teacher')} · ${esc(c.room || 'No room')}</p>
        </div>
        <span class="stat__icon stat__icon--indigo">${icon('classes')}</span>
      </div>

      <div class="grid grid--3" style="gap:10px;margin:16px 0 14px">
        <div><div class="small muted">Students</div><div class="strong" style="font-size:17px">${c.student_count}<span class="small muted">/${c.capacity || '—'}</span></div></div>
        <div><div class="small muted">Average</div><div class="strong" style="font-size:17px">${pct(c.average, 1)}</div></div>
        <div><div class="small muted">Attendance</div><div class="strong" style="font-size:17px">${pct(c.attendanceRate)}</div></div>
      </div>
      <div class="bar"><span style="width:${fill}%"></span></div>
      <div class="inline small muted" style="justify-content:space-between;margin-top:6px">
        <span>${fill}% of capacity</span>
        <span>${c.feeBalance > 0 ? money(c.feeBalance) + ' outstanding' : 'Fees settled'}</span>
      </div>
    </div>
  </div>`;
}

async function renderList(root) {
  let list = await get('/classes');

  if (state.user.role === 'teacher') {
    try {
      const ov = await get('/overview');
      const mine = new Set((ov.classes || []).map((c) => Number(c.id)));
      list = list.filter((c) => mine.has(Number(c.id)));
    } catch { /* fall back to all classes */ }
  }

  setPageMeta(state.user.role === 'teacher' ? 'My classes' : 'Classes',
    `${list.length} class${list.length === 1 ? '' : 'es'} this term`);

  root.innerHTML = `
    ${pageHead(
    state.user.role === 'teacher' ? 'My classes' : 'Classes',
    `${list.length} class${list.length === 1 ? '' : 'es'} · ${list.reduce((n, c) => n + c.student_count, 0)} students`,
    isAdmin() ? `<button class="btn btn--primary" id="add-class">${icon('plus')} New class</button>` : '',
  )}

    ${list.length ? (() => {
      const groups = new Map();
      list.forEach((c) => {
        const key = c.section_name || 'No section';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      });
      return [...groups.entries()].map(([name, items]) => `
        <div class="section-block">
          <div class="section-block__head">
            <div>
              <h3>${esc(name)}</h3>
              <p>${items.length} class${items.length === 1 ? '' : 'es'} · ${items.reduce((n, c) => n + c.student_count, 0)} students</p>
            </div>
            ${items[0].section_id ? `<button class="btn btn--ghost btn--sm" data-section="${items[0].section_id}">${icon('sections')} Open section</button>` : ''}
          </div>
          <div class="grid grid--2">${items.map(classCard).join('')}</div>
        </div>`).join('');
    })() : `<div class="card">${emptyState('No classes yet', 'Create a class to group students, subjects and timetables.', 'classes')}</div>`}`;

  root.querySelectorAll('[data-class]').forEach((card) => {
    card.addEventListener('click', () => navigate(`classes?class=${card.dataset.class}`));
  });

  root.querySelectorAll('[data-section]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`sections?section=${btn.dataset.section}`);
    });
  });

  document.getElementById('add-class')?.addEventListener('click', () => {
    openModal({
      title: 'Create a class',
      body: classForm({ capacity: 30, level: 'Junior' }),
      submitLabel: 'Create class',
      onSubmit: async (data) => {
        await post('/classes', data);
        toast(`${data.name} created.`);
        refresh();
      },
    });
  });
}

/* ══════════════════════════════════════════════════════════
   Detail
   ══════════════════════════════════════════════════════════ */

async function renderDetail(root, id) {
  const [all, students, subjects, timetable] = await Promise.all([
    get('/classes'),
    get(`/students?class_id=${id}`),
    get(`/subjects?class_id=${id}`),
    get(`/timetable?class_id=${id}`),
  ]);
  const c = all.find((x) => String(x.id) === String(id));
  if (!c) {
    root.innerHTML = `<div class="card">${emptyState('Class not found', 'It may have been deleted.', 'alert')}</div>`;
    return;
  }

  setPageMeta(c.name, `${c.section_name ? c.section_name + ' · ' : ''}${c.level} · ${c.student_count} students`);

  root.innerHTML = `
    <div class="inline" style="margin-bottom:14px">
      <button class="btn btn--ghost btn--sm" id="back">${icon('arrowLeft')} Back to classes</button>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="profile">
          <div class="avatar avatar--xl" style="background:linear-gradient(135deg,#6366f1,#4338ca);border-radius:20px">
            ${icon('classes')}
          </div>
          <div class="profile__main">
            <div class="inline" style="margin-bottom:4px">
              <h2>${esc(c.name)}</h2>
              <span class="badge badge--${c.level === 'Senior' ? 'indigo' : 'sky'}">${esc(c.level)}</span>
              ${c.section_name ? `<button class="badge badge--violet" data-section-link="${c.section_id}" style="border:0;cursor:pointer">${esc(c.section_name)}</button>` : ''}
            </div>
            <div class="profile__meta">
              <span>${icon('user')} ${esc(c.form_teacher || 'No form teacher')}</span>
              <span>${icon('pin')} ${esc(c.room || 'No room')}</span>
              <span>${icon('students')} ${c.student_count} / ${c.capacity || '—'} students</span>
            </div>
          </div>
          <div class="page-head__actions">
            <button class="btn" id="view-timetable">${icon('timetable')} Timetable</button>
            ${isAdmin() ? `<button class="btn" id="edit-class">${icon('edit')} Edit</button>
              <button class="btn btn--danger" id="delete-class">${icon('trash')}</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid--4 mt-2">
      <div class="card stat"><div class="stat__top"><span class="stat__label">Students</span><span class="stat__icon stat__icon--indigo">${icon('students')}</span></div>
        <div class="stat__value">${c.student_count}</div><div class="stat__foot"><span>Capacity ${c.capacity || '—'}</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Class average</span><span class="stat__icon stat__icon--violet">${icon('percent')}</span></div>
        <div class="stat__value">${pct(c.average, 1)}</div><div class="stat__foot"><span>All subjects</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Attendance</span><span class="stat__icon stat__icon--green">${icon('attendance')}</span></div>
        <div class="stat__value">${pct(c.attendanceRate)}</div><div class="stat__foot"><span>Term to date</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Fees outstanding</span><span class="stat__icon stat__icon--amber">${icon('fees')}</span></div>
        <div class="stat__value" style="font-size:22px">${money(c.feeBalance)}</div><div class="stat__foot"><span>${money(c.feePaid)} collected</span></div></div>
    </div>

    <div class="grid grid--2-1 mt-2">
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Students</h3><p>${students.length} learners in this class</p></div></div>
        ${students.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Student</th><th class="num">Attendance</th><th class="num">Average</th><th></th></tr></thead>
          <tbody>${students.map((s) => `
            <tr class="row-link" data-student="${s.id}">
              <td><div class="person">${avatar(s.name, s.color, 'sm')}<div class="person__text"><strong>${esc(s.name)}</strong><span>${esc(s.admission_no)}</span></div></div></td>
              <td class="num">${pct(s.attendanceRate)}</td>
              <td class="num strong">${pct(s.average, 1)}</td>
              <td><div class="table__actions"><button class="icon-btn">${icon('chevronRight')}</button></div></td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<div class="table__empty">No students in this class yet.</div>'}
      </div>

      <div class="card">
        <div class="card__head">
          <div class="grow"><h3>Subjects</h3><p>${subjects.length} subjects taught</p></div>
          ${isAdmin() ? `<button class="btn btn--soft btn--sm" id="add-subject">${icon('plus')} Add</button>` : ''}
        </div>
        <div class="list">
          ${subjects.length ? subjects.map((s) => `
            <div class="list__item">
              <div class="list__text"><strong>${esc(s.name)}</strong><span>${esc(s.teacher || 'Unassigned')} · ${esc(s.code)}</span></div>
              ${isAdmin() ? `<button class="icon-btn" data-del-subject="${s.id}" title="Remove subject">${icon('trash')}</button>` : `<span class="badge badge--slate badge--plain">${s.periods}/wk</span>`}
            </div>`).join('') : '<div class="table__empty">No subjects assigned.</div>'}
        </div>
      </div>
    </div>

    <div class="card mt-2">
      <div class="card__head"><div class="grow"><h3>Weekly timetable</h3><p>${timetable.length} lessons scheduled</p></div>
        <button class="btn btn--ghost btn--sm" id="full-timetable">Open full timetable ${icon('chevronRight')}</button></div>
      <div class="card__body scroll-x">
        ${timetable.length ? miniTimetable(timetable) : emptyState('No lessons yet', 'Add lessons from the timetable page.', 'timetable')}
      </div>
    </div>`;

  document.getElementById('back')?.addEventListener('click', () => navigate('classes'));
  document.getElementById('view-timetable')?.addEventListener('click', () => navigate('timetable'));
  document.getElementById('full-timetable')?.addEventListener('click', () => navigate('timetable'));
  root.querySelector('[data-section-link]')?.addEventListener('click', () => {
    navigate(`sections?section=${c.section_id}`);
  });

  root.querySelectorAll('[data-student]').forEach((row) => {
    row.addEventListener('click', () => navigate(`students/${row.dataset.student}`));
  });

  document.getElementById('edit-class')?.addEventListener('click', () => {
    openModal({
      title: `Edit ${c.name}`,
      body: classForm({ ...c, form_teacher_id: c.form_teacher_id || '' }),
      submitLabel: 'Save changes',
      onSubmit: async (data) => {
        await patch(`/classes/${c.id}`, data);
        toast('Class updated.');
        refresh();
      },
    });
  });

  document.getElementById('delete-class')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete class',
      message: `Delete ${c.name}? Its subjects and timetable will be removed. Students will become unassigned.`,
      confirmLabel: 'Delete class',
    });
    if (!ok) return;
    await del(`/classes/${c.id}`);
    toast('Class deleted.', 'info');
    navigate('classes');
  });

  document.getElementById('add-subject')?.addEventListener('click', () => {
    openModal({
      title: 'Add a subject',
      subtitle: `${c.name} · choose a teacher and weekly periods`,
      body: formFields([
        { name: 'name', label: 'Subject name', required: true, placeholder: 'e.g. Further Mathematics' },
        { name: 'code', label: 'Subject code', required: true, placeholder: 'e.g. FMT' },
        { name: 'teacher_id', label: 'Teacher', type: 'select', options: teachers().map((t) => ({ value: t.id, label: t.name })), placeholder: 'Unassigned' },
        { name: 'periods', label: 'Periods per week', type: 'number', min: 1, max: 10, value: 4 },
      ]),
      submitLabel: 'Add subject',
      onSubmit: async (data) => {
        await post('/subjects', { ...data, class_id: c.id });
        toast(`${data.name} added.`);
        refresh();
      },
    });
  });

  root.querySelectorAll('[data-del-subject]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Remove subject',
        message: 'This removes the subject, its timetable slots and recorded grades.',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      await del(`/subjects/${btn.dataset.delSubject}`);
      toast('Subject removed.', 'info');
      refresh();
    });
  });
}

function miniTimetable(rows) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const times = [...new Set(rows.map((r) => r.start_time))].sort();
  return `<table class="timetable">
    <thead><tr><th></th>${days.map((d) => `<th>${d.slice(0, 3)}</th>`).join('')}</tr></thead>
    <tbody>${times.map((t) => `<tr>
      <td class="time-cell">${esc(t)}</td>
      ${days.map((d) => {
    const slot = rows.find((r) => r.day === d && r.start_time === t);
    return `<td>${slot ? `<div class="slot"><strong>${esc(slot.subject)}</strong><span>${esc(slot.teacher || '')}</span></div>` : '<div class="slot slot--empty"></div>'}</td>`;
  }).join('')}
    </tr>`).join('')}</tbody>
  </table>`;
}
