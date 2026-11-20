import { get, post, del } from '../api.js';
import { state, classes, subjects, refresh, isAdmin } from '../store.js';
import {
  esc, icon, pageHead, setPageMeta, emptyState, openModal, confirmDialog, formFields, toast,
} from '../ui.js';
import { downloadPdf } from '../pdf.js?v=12';
import { buildTimetable } from '../documents.js?v=12';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_TIMES = [['08:00', '08:45'], ['08:50', '09:35'], ['09:40', '10:25'], ['11:00', '11:45'], ['11:50', '12:35']];

let mode = '';
let modeUser = null;
let currentRows = [];

function initialMode() {
  if (state.user.role === 'teacher') return 'mine';
  if (state.user.role === 'student') return String(state.user.class_id || classes()[0]?.id || '');
  return String(classes()[0]?.id || '');
}

export async function render(root) {
  if (modeUser !== state.user?.id) {
    mode = '';
    modeUser = state.user?.id;
  }
  if (!mode) mode = initialMode();

  setPageMeta('Timetable', 'Weekly lesson schedule');

  root.innerHTML = `
    ${pageHead('Timetable', 'Weekly lesson schedule',
    `<button class="btn" id="print-tt">${icon('printer')} Print</button>
     ${isAdmin() ? `<button class="btn btn--primary" id="add-lesson">${icon('plus')} Add lesson</button>` : ''}`)}
    <div class="card">
      <div class="card__body" style="padding:14px 16px">
        <div class="inline" style="gap:10px">
          ${state.user.role !== 'student' ? `<select id="tt-mode" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff;min-width:170px">
            ${state.user.role === 'teacher' ? `<option value="mine" ${mode === 'mine' ? 'selected' : ''}>My schedule</option>` : ''}
            ${classes().map((c) => `<option value="${c.id}" ${mode === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>` : `<span class="badge badge--indigo">${esc(state.user.class_name || '')}</span>`}
          <div class="spacer"></div>
          <span class="small muted" id="tt-count"></span>
        </div>
      </div>
    </div>
    <div class="card mt-2">
      <div class="card__body scroll-x" id="tt-body">
        <div class="skeleton" style="height:300px"></div>
      </div>
    </div>`;

  document.getElementById('print-tt')?.addEventListener('click', () => {
    if (!currentRows.length) return toast('There are no lessons to print yet.', 'error');
    const label = mode === 'mine'
      ? 'My schedule'
      : classes().find((c) => String(c.id) === String(mode))?.name || 'Class timetable';
    downloadPdf(buildTimetable({
      rows: currentRows,
      title: 'WEEKLY TIMETABLE',
      subtitle: `${label} - ${state.meta?.term || ''}`,
    }), `timetable-${label.replace(/\s/g, '-')}.pdf`, 'Timetable ready.');
  });
  document.getElementById('tt-mode')?.addEventListener('change', (e) => {
    mode = e.target.value;
    load();
  });
  document.getElementById('add-lesson')?.addEventListener('click', openAddLesson);

  async function load() {
    const body = document.getElementById('tt-body');
    try {
      const query = mode === 'mine' ? 'mine=1' : `class_id=${mode}`;
      const rows = await get(`/timetable?${query}`);
      currentRows = rows;
      document.getElementById('tt-count').textContent = `${rows.length} lesson${rows.length === 1 ? '' : 's'} per week`;
      body.innerHTML = rows.length
        ? `<div class="tt-desktop">${gridHtml(rows)}</div><div class="tt-mobile">${dayListHtml(rows)}</div>`
        : emptyState(
          'No lessons scheduled',
          mode === 'mine' ? 'You have no lessons on the timetable yet.' : 'Add lessons to build this class timetable.',
          'timetable',
        );
      body.querySelectorAll('[data-slot]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = await confirmDialog({
            title: 'Remove lesson',
            message: 'Remove this lesson from the timetable?',
            confirmLabel: 'Remove',
          });
          if (!ok) return;
          await del(`/timetable/${btn.dataset.slot}`);
          toast('Lesson removed.', 'info');
          load();
        });
      });
    } catch (err) {
      body.innerHTML = `<div class="table__empty">${esc(err.message)}</div>`;
    }
  }

  function gridHtml(rows) {
    const times = [...new Set(rows.map((r) => r.start_time))].sort();
    const slots = times.length ? times : DEFAULT_TIMES.map((t) => t[0]);
    return `<table class="timetable">
      <thead><tr><th style="width:74px"></th>${DAYS.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${slots.map((start) => {
      const end = rows.find((r) => r.start_time === start)?.end_time
        || DEFAULT_TIMES.find((t) => t[0] === start)?.[1] || '';
      return `<tr>
          <td class="time-cell">${esc(start)}<br><span class="muted" style="font-size:9.5px">${esc(end)}</span></td>
          ${DAYS.map((day) => {
        const slot = rows.find((r) => r.day === day && r.start_time === start);
        if (!slot) return '<td><div class="slot slot--empty"></div></td>';
        return `<td><div class="slot" title="${esc(slot.subject)} · ${esc(slot.teacher || '')}">
            ${isAdmin() ? `<button class="icon-btn" data-slot="${slot.id}" title="Remove lesson"
              style="float:right;width:20px;height:20px;margin:-4px -4px 0 4px;color:#cbd5e1">${icon('close')}</button>` : ''}
            <strong>${esc(slot.subject)}</strong>
            <span>${esc(slot.teacher || 'Unassigned')}</span>
            <em>${esc(slot.room || slot.class_name || '')}</em>
          </div></td>`;
      }).join('')}
        </tr>`;
    }).join('')}</tbody>
    </table>`;
  }

  function dayListHtml(rows) {
    const days = DAYS.filter((d) => rows.some((r) => r.day === d));
    return days.map((day) => {
      const lessons = rows.filter((r) => r.day === day)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      return `<div class="tt-day">
        <div class="tt-day__head">${esc(day)}<span>${lessons.length} lesson${lessons.length === 1 ? '' : 's'}</span></div>
        <div class="list">
          ${lessons.map((slot) => `<div class="list__item" style="padding:11px 14px">
            <div class="tt-day__time">${esc(slot.start_time)}<br><span>${esc(slot.end_time)}</span></div>
            <div class="list__text">
              <strong>${esc(slot.subject)}</strong>
              <span>${esc(slot.teacher || 'Unassigned')}${slot.room ? ` · ${esc(slot.room)}` : ''}</span>
            </div>
            ${isAdmin() ? `<button class="icon-btn" data-slot="${slot.id}" title="Remove lesson"
                style="color:#cbd5e1">${icon('trash')}</button>` : ''}
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  function openAddLesson() {
    const classId = mode === 'mine' ? classes()[0]?.id : Number(mode);
    const classSubjects = subjects().filter((s) => String(s.class_id) === String(classId));
    if (!classSubjects.length) {
      toast('Add subjects to this class first.', 'error');
      return;
    }
    openModal({
      title: 'Add a lesson',
      subtitle: classes().find((c) => String(c.id) === String(classId))?.name || '',
      body: formFields([
        {
          name: 'subject_id', label: 'Subject', type: 'select', required: true,
          options: classSubjects.map((s) => ({ value: s.id, label: `${s.name} — ${s.teacher || 'Unassigned'}` })),
        },
        { name: 'day', label: 'Day', type: 'select', required: true, options: DAYS },
        { name: 'start_time', label: 'Starts', type: 'time', required: true, value: '08:00' },
        { name: 'end_time', label: 'Ends', type: 'time', required: true, value: '08:45' },
        { name: 'room', label: 'Room', placeholder: 'e.g. B-101' },
      ]),
      submitLabel: 'Add lesson',
      onSubmit: async (data) => {
        await post('/timetable', { ...data, class_id: classId });
        toast('Lesson added to the timetable.');
        load();
      },
    });
  }

  await load();
}
