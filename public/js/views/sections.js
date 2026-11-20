import { get, post, patch, del } from '../api.js';
import { state, refresh, navigate, isAdmin, teachers } from '../store.js';
import {
  esc, icon, avatar, money, pct, pageHead, setPageMeta, emptyState, openModal,
  confirmDialog, formFields, toast,
} from '../ui.js';
import { downloadPdf } from '../pdf.js?v=11';
import { buildSectionReport } from '../documents.js?v=11';

function hashQuery() {
  return new URLSearchParams(location.hash.split('?')[1] || '');
}

function sectionForm(values = {}) {
  return formFields([
    { name: 'name', label: 'Section name', required: true, placeholder: 'e.g. Junior Secondary' },
    { name: 'code', label: 'Short code', placeholder: 'e.g. JSS' },
    {
      name: 'level', label: 'Level', type: 'select',
      options: ['Nursery', 'Primary', 'Junior', 'Senior', 'Combined'],
      placeholder: 'Choose a level',
    },
    {
      name: 'head_teacher_id', label: 'Head of section', type: 'select',
      options: teachers().map((t) => ({ value: t.id, label: `${t.name}${t.specialty ? ` · ${t.specialty}` : ''}` })),
      placeholder: 'Unassigned',
    },
    { name: 'description', label: 'Description', type: 'textarea', rows: 3, full: true, placeholder: 'What this section covers' },
  ], values);
}

/* ══════════════════════════════════════════════════════════
   Section list
   ══════════════════════════════════════════════════════════ */

async function renderList(root) {
  const list = await get('/sections');
  const students = list.reduce((n, s) => n + s.student_count, 0);
  const classes = list.reduce((n, s) => n + s.class_count, 0);

  setPageMeta('Sections', `${list.length} sections · ${classes} classes · ${students} students`);

  root.innerHTML = `
    ${pageHead(
    'Sections',
    `${list.length} section${list.length === 1 ? '' : 's'} · ${classes} classes · ${students} students`,
    isAdmin() ? `<button class="btn btn--primary" id="add-section">${icon('plus')} New section</button>` : '',
  )}

    ${list.length ? `<div class="grid grid--2">
      ${list.map((s) => `
        <div class="card row-link" data-section="${s.id}" style="cursor:pointer">
          <div class="card__body">
            <div class="inline" style="justify-content:space-between;align-items:flex-start">
              <div>
                <div class="inline" style="margin-bottom:4px">
                  <h3 style="font-size:18px">${esc(s.name)}</h3>
                  ${s.code ? `<span class="badge badge--slate badge--plain">${esc(s.code)}</span>` : ''}
                  ${s.current ? '<span class="badge badge--green">Your section</span>' : ''}
                </div>
                <p class="small muted">${esc(s.description || `${s.level || ''} section`)}</p>
              </div>
              ${s.head ? avatar(s.head, s.head_color || '#0ea5e9', 'lg', s.head_photo)
    : `<span class="stat__icon stat__icon--indigo">${icon('sections')}</span>`}
            </div>

            <div class="inline small" style="margin-top:14px;gap:6px">
              <span class="badge badge--indigo">${s.class_count} class${s.class_count === 1 ? '' : 'es'}</span>
              <span class="badge badge--sky">${s.teacher_count} teacher${s.teacher_count === 1 ? '' : 's'}</span>
              ${s.head ? `<span class="badge badge--violet">Head · ${esc(s.head)}</span>` : '<span class="badge badge--slate">No head assigned</span>'}
            </div>

            <div class="grid grid--4" style="gap:8px;margin-top:16px">
              <div><div class="small muted">Students</div><div class="strong" style="font-size:17px">${s.student_count}</div></div>
              <div><div class="small muted">Average</div><div class="strong" style="font-size:17px">${pct(s.average, 1)}</div></div>
              <div><div class="small muted">Attendance</div><div class="strong" style="font-size:17px">${pct(s.attendanceRate)}</div></div>
              <div><div class="small muted">Fee balance</div><div class="strong" style="font-size:14px">${money(s.feeBalance)}</div></div>
            </div>

            <div class="inline small muted" style="justify-content:space-between;margin-top:14px">
              <span>${s.level || 'School section'}</span>
              <span>Open section →</span>
            </div>
          </div>
        </div>`).join('')}
    </div>` : `<div class="card">${emptyState('No sections yet', 'Create a section to group classes under a head of section.', 'sections')}</div>`}`;

  root.querySelectorAll('[data-section]').forEach((card) => {
    card.addEventListener('click', () => navigate(`sections?section=${card.dataset.section}`));
  });

  document.getElementById('add-section')?.addEventListener('click', () => {
    openModal({
      title: 'Create a section',
      subtitle: 'A section groups classes under one head of section.',
      body: sectionForm({ level: 'Junior' }),
      submitLabel: 'Create section',
      wide: true,
      onSubmit: async (data) => {
        if (!data.name) throw new Error('Section name is required.');
        await post('/sections', data);
        toast(`${data.name} created.`);
        refresh();
      },
    });
  });
}

/* ══════════════════════════════════════════════════════════
   Section detail
   ══════════════════════════════════════════════════════════ */

async function renderDetail(root, id) {
  const data = await get(`/sections/${id}`);
  const s = data.section;

  setPageMeta(s.name, `${s.code || s.level || 'Section'} · ${s.class_count} classes · ${s.student_count} students`);

  root.innerHTML = `
    <div class="inline" style="margin-bottom:14px">
      <button class="btn btn--ghost btn--sm" id="back">${icon('arrowLeft')} Back to sections</button>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="profile">
          <div class="avatar avatar--xl" style="background:linear-gradient(135deg,#6366f1,#4338ca);border-radius:20px">
            ${icon('sections')}
          </div>
          <div class="profile__main">
            <div class="inline" style="margin-bottom:4px">
              <h2>${esc(s.name)}</h2>
              ${s.code ? `<span class="badge badge--slate badge--plain">${esc(s.code)}</span>` : ''}
              ${s.level ? `<span class="badge badge--indigo">${esc(s.level)}</span>` : ''}
            </div>
            <div class="profile__meta">
              <span>${icon('teacher')} ${s.head ? `Head: ${esc(s.head)}` : 'No head assigned'}</span>
              <span>${icon('classes')} ${s.class_count} classes</span>
              <span>${icon('students')} ${s.student_count} students</span>
              <span>${icon('students')} ${s.teacher_count} teachers</span>
            </div>
            ${s.description ? `<p class="small muted" style="margin-top:8px">${esc(s.description)}</p>` : ''}
          </div>
          <div class="page-head__actions">
            <button class="btn" id="print-section">${icon('printer')} Print report</button>
            ${isAdmin() ? `<button class="btn" id="edit-section">${icon('edit')} Edit</button>
              <button class="btn btn--danger" id="delete-section">${icon('trash')}</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid--4 mt-2">
      <div class="card stat"><div class="stat__top"><span class="stat__label">Students</span><span class="stat__icon stat__icon--indigo">${icon('students')}</span></div>
        <div class="stat__value">${s.student_count}</div><div class="stat__foot"><span>${s.class_count} classes</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Average score</span><span class="stat__icon stat__icon--violet">${icon('percent')}</span></div>
        <div class="stat__value">${pct(s.average, 1)}</div><div class="stat__foot"><span>All classes</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Attendance</span><span class="stat__icon stat__icon--green">${icon('attendance')}</span></div>
        <div class="stat__value">${pct(s.attendanceRate)}</div><div class="stat__foot"><span>Term to date</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Fee balance</span><span class="stat__icon stat__icon--amber">${icon('fees')}</span></div>
        <div class="stat__value" style="font-size:22px">${money(s.feeBalance)}</div><div class="stat__foot"><span>${money(s.feePaid)} collected</span></div></div>
    </div>

    <div class="grid grid--2-1 mt-2">
      <div class="card">
        <div class="card__head"><div class="grow"><h3>Classes</h3><p>Classes grouped under ${esc(s.name)}</p></div></div>
        ${data.classes.length ? `<div class="table-wrap"><table class="table table--students">
          <thead><tr><th>Class</th><th class="hide-sm">Form teacher</th><th class="num">Students</th><th class="num">Average</th><th></th></tr></thead>
          <tbody>${data.classes.map((c) => `
            <tr class="row-link" data-class="${c.id}">
              <td><div class="strong">${esc(c.name)}</div><div class="small muted">${esc(c.room || 'No room')}</div></td>
              <td class="hide-sm">${esc(c.form_teacher || '—')}</td>
              <td class="num">${c.student_count}</td>
              <td class="num strong">${pct(c.average, 1)}</td>
              <td><div class="table__actions"><button class="icon-btn">${icon('chevronRight')}</button></div></td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<div class="table__empty">No classes in this section yet.</div>'}
      </div>

      <div class="card">
        <div class="card__head"><div class="grow"><h3>Teaching staff</h3><p>${data.teachers.length} teachers in this section</p></div></div>
        <div class="list">
          ${data.teachers.length ? data.teachers.map((t) => `
            <div class="list__item">
              ${avatar(t.name, '#0ea5e9', 'sm', t.photo)}
              <div class="list__text"><strong>${esc(t.name)}</strong><span>${esc(t.specialty || 'Teacher')} · ${t.subject_count} subjects</span></div>
            </div>`).join('') : '<div class="table__empty">No teachers assigned yet.</div>'}
        </div>
      </div>
    </div>

    <div class="card mt-2">
      <div class="card__head"><div class="grow"><h3>Top students</h3><p>Highest averages in this section</p></div></div>
      ${data.topStudents.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>Student</th><th>Class</th><th class="num">Average</th><th class="num">Grade</th></tr></thead>
        <tbody>${data.topStudents.map((t, i) => `
          <tr class="row-link" data-student="${t.id}">
            <td class="muted">${i + 1}</td>
            <td><div class="person">${avatar(t.name, '#4f46e5', 'sm', t.photo)}
              <div class="person__text"><strong>${esc(t.name)}</strong></div></div></td>
            <td>${esc(t.class_name || '—')}</td>
            <td class="num strong">${pct(t.pct, 1)}</td>
            <td class="num"><span class="badge badge--indigo">${esc(t.grade || '—')}</span></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="table__empty">No results recorded for this section yet.</div>'}
    </div>`;

  document.getElementById('back')?.addEventListener('click', () => navigate('sections'));
  root.querySelectorAll('[data-class]').forEach((row) => {
    row.addEventListener('click', () => navigate(`classes?class=${row.dataset.class}`));
  });
  root.querySelectorAll('[data-student]').forEach((row) => {
    row.addEventListener('click', () => navigate(`students/${row.dataset.student}`));
  });

  document.getElementById('print-section')?.addEventListener('click', () => {
    downloadPdf(buildSectionReport(data), `section-${s.name.replace(/\s/g, '-')}.pdf`, 'Section report ready.');
  });

  document.getElementById('edit-section')?.addEventListener('click', () => {
    openModal({
      title: `Edit ${s.name}`,
      body: sectionForm({ ...s, head_teacher_id: s.head_teacher_id || '', description: s.description || '' }),
      submitLabel: 'Save changes',
      wide: true,
      onSubmit: async (form) => {
        await patch(`/sections/${s.id}`, form);
        toast('Section updated.');
        refresh();
      },
    });
  });

  document.getElementById('delete-section')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete section',
      message: `Delete ${s.name}? Its ${s.class_count} classes will become unassigned; students and results are not deleted.`,
      confirmLabel: 'Delete section',
    });
    if (!ok) return;
    await del(`/sections/${s.id}`);
    toast('Section deleted.', 'info');
    navigate('sections');
  });
}

export async function render(root) {
  const id = hashQuery().get('section');
  if (id) return renderDetail(root, id);
  return renderList(root);
}
