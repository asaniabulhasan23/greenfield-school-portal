import { get, post, del } from '../api.js';
import { state, refresh, isStaff } from '../store.js';
import {
  esc, icon, pageHead, setPageMeta, emptyState, openModal, confirmDialog, formFields, toast,
} from '../ui.js';

function composeModal() {
  openModal({
    title: 'New announcement',
    subtitle: 'Everyone in the selected audience will see this notice.',
    body: formFields([
      { name: 'title', label: 'Title', required: true, placeholder: 'e.g. End of term examinations', full: true },
      {
        name: 'audience', label: 'Audience', type: 'select',
        options: [{ value: 'all', label: 'Everyone' }, { value: 'students', label: 'Students only' }, { value: 'teachers', label: 'Teachers only' }],
      },
      { name: 'pinned', label: 'Pin to top', type: 'select', options: [{ value: '0', label: 'No' }, { value: '1', label: 'Yes' }] },
      { name: 'body', label: 'Message', type: 'textarea', required: true, rows: 6, full: true, placeholder: 'Write the notice…' },
    ]),
    submitLabel: 'Publish',
    wide: true,
    onSubmit: async (data) => {
      await post('/announcements', { ...data, pinned: data.pinned === '1' });
      toast('Announcement published.');
      refresh();
    },
  });
}

export async function render(root) {
  const list = await get('/announcements');
  setPageMeta('Announcements', `${list.length} notice${list.length === 1 ? '' : 's'} for the school`);

  root.innerHTML = `
    ${pageHead('Announcements', 'Notices from the school office and staff',
    isStaff() ? `<button class="btn btn--primary" id="new-announcement">${icon('plus')} New announcement</button>` : '')}

    ${list.length ? `<div class="grid grid--2">
      ${list.map((a) => {
    const canDelete = state.user.role === 'admin' || a.author_id === state.user.id;
    const audienceLabel = a.audience === 'all' ? 'Everyone' : a.audience === 'students' ? 'Students' : 'Teachers';
    return `<div class="card ${a.pinned ? 'announce--pinned' : ''}">
          <div class="card__body">
            <div class="inline" style="justify-content:space-between;align-items:flex-start;margin-bottom:8px">
              <div class="inline" style="gap:6px">
                ${a.pinned ? `<span class="badge badge--indigo">Pinned</span>` : ''}
                <span class="badge badge--slate badge--plain">${esc(audienceLabel)}</span>
              </div>
              ${canDelete ? `<button class="icon-btn" data-del="${a.id}" title="Delete" style="width:30px;height:30px;margin:-4px -4px 0 0">${icon('trash')}</button>` : ''}
            </div>
            <h3 style="font-size:15.5px;letter-spacing:-.01em;margin-bottom:6px">${esc(a.title)}</h3>
            <p style="font-size:13px;color:var(--text-2);line-height:1.65;white-space:pre-line">${esc(a.body)}</p>
            <div class="announce__meta" style="margin-top:12px">
              <span>${esc(a.author || 'School office')}</span><span>·</span>
              <span>${esc(a.ago || '')}</span>
            </div>
          </div>
        </div>`;
  }).join('')}
    </div>` : `<div class="card">${emptyState('No announcements', 'Notices posted by the school will appear here.', 'announcements')}</div>`}`;

  document.getElementById('new-announcement')?.addEventListener('click', composeModal);

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete announcement',
        message: 'This notice will be removed for everyone. Continue?',
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      await del(`/announcements/${btn.dataset.del}`);
      toast('Announcement deleted.', 'info');
      refresh();
    });
  });

  if (new URLSearchParams(location.hash.split('?')[1] || '').get('new') === '1' && isStaff()) {
    composeModal();
  }
}
