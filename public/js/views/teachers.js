import { get, post, patch, del } from '../api.js';
import { refresh, isAdmin, state } from '../store.js';
import {
  esc, icon, avatar, pageHead, setPageMeta, emptyState, openModal, confirmDialog,
  formFields, toast,
} from '../ui.js';

function teacherFields(v = {}) {
  return formFields([
    { name: 'name', label: 'Full name', required: true, placeholder: 'e.g. Mr. John Ade' },
    { name: 'email', label: 'Email address', type: 'email', required: true, placeholder: 'name@greenfield.edu.ng' },
    { name: 'phone', label: 'Phone number', type: 'tel' },
    { name: 'specialty', label: 'Subject speciality', placeholder: 'e.g. Mathematics' },
    { name: 'qualification', label: 'Qualification', placeholder: 'e.g. B.Sc., PGDE' },
    { name: 'hired_at', label: 'Date employed', type: 'date' },
    { name: 'staff_no', label: 'Staff number', placeholder: 'Auto-generated if blank' },
    { name: 'password', label: 'Temporary password', hint: 'Defaults to teach123 if left blank.' },
  ], v);
}

export async function render(root) {
  const list = await get('/teachers');
  setPageMeta('Teachers', `${list.length} member${list.length === 1 ? '' : 's'} of teaching staff`);

  root.innerHTML = `
    ${pageHead(
    'Teaching staff',
    `${list.length} teacher${list.length === 1 ? '' : 's'} · ${list.reduce((n, t) => n + t.subject_count, 0)} subject assignments`,
    isAdmin() ? `<button class="btn btn--primary" id="add-teacher">${icon('userPlus')} Add teacher</button>` : '',
  )}

    ${list.length ? `<div class="grid grid--2">
      ${list.map((t) => `
        <div class="card">
          <div class="card__body">
            <div class="person" style="margin-bottom:14px">
              ${avatar(t.name, t.color, 'lg', t.photo)}
              <div class="person__text">
                <strong style="font-size:14.5px">${esc(t.name)}</strong>
                <span>${esc(t.specialty || 'Teacher')}</span>
                <span class="small muted">${esc(t.staff_no || '')}</span>
              </div>
            </div>
            <dl class="kv" style="grid-template-columns:88px 1fr">
              <dt>Email</dt><dd style="font-size:11.5px;word-break:break-word">${esc(t.email)}</dd>
              <dt>Phone</dt><dd>${esc(t.phone || '—')}</dd>
              <dt>Qualification</dt><dd>${esc(t.qualification || '—')}</dd>
              <dt>Employed</dt><dd>${t.hired_at ? new Date(t.hired_at + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}</dd>
            </dl>
            <div class="inline" style="margin-top:14px;gap:6px">
              <span class="badge badge--indigo">${t.subject_count} subject${t.subject_count === 1 ? '' : 's'}</span>
              <span class="badge badge--sky">${t.class_count} form class${t.class_count === 1 ? '' : 'es'}</span>
              ${(() => {
                const head = (state.meta?.sections || []).find((s) => Number(s.head_teacher_id) === Number(t.id));
                return head ? `<span class="badge badge--violet">Head · ${esc(head.name)}</span>` : '';
              })()}
            </div>
            ${isAdmin() ? `<div class="inline" style="margin-top:14px;justify-content:flex-end">
              <button class="btn btn--sm" data-edit="${t.id}">${icon('edit')} Edit</button>
              <button class="btn btn--sm btn--ghost" data-del="${t.id}" style="color:#dc2626">${icon('trash')}</button>
            </div>` : ''}
          </div>
        </div>`).join('')}
    </div>` : `<div class="card">${emptyState('No teachers yet', 'Add teaching staff to assign subjects and classes.', 'teacher')}</div>`}`;

  const byId = new Map(list.map((t) => [String(t.id), t]));

  document.getElementById('add-teacher')?.addEventListener('click', () => {
    openModal({
      title: 'Add a teacher',
      subtitle: 'A staff portal account will be created.',
      body: teacherFields(),
      submitLabel: 'Add teacher',
      wide: true,
      onSubmit: async (data) => {
        await post('/teachers', data);
        toast(`${data.name} has been added to staff.`);
        refresh();
      },
    });
  });

  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = byId.get(btn.dataset.edit);
      openModal({
        title: `Edit ${t.name}`,
        body: teacherFields({ ...t, password: '' }),
        submitLabel: 'Save changes',
        wide: true,
        onSubmit: async (data) => {
          await patch(`/teachers/${t.id}`, data);
          toast('Teacher details updated.');
          refresh();
        },
      });
    });
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const t = byId.get(btn.dataset.del);
      const ok = await confirmDialog({
        title: 'Remove teacher',
        message: `Remove ${t.name} from staff? Their subject assignments will become unassigned.`,
        confirmLabel: 'Remove teacher',
      });
      if (!ok) return;
      await del(`/teachers/${t.id}`);
      toast('Teacher removed.', 'info');
      refresh();
    });
  });
}
