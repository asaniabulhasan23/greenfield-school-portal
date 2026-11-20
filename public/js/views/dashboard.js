import { get } from '../api.js';
import { state, navigate, classes } from '../store.js';
import {
  esc, icon, avatar, money, compactMoney, pct, dateShort, dateTiny, gradeBadge,
  areaChart, donut, metricBars, pageHead, setPageMeta, emptyState,
} from '../ui.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName() {
  const parts = String(state.user?.name || '').split(/\s+/).filter(Boolean);
  const titles = /^(dr|mr|mrs|ms|miss|prof|sir|alhaji|hajiya|chief)\.?$/i;
  return parts.find((p) => !titles.test(p)) || parts[0] || '';
}

function statCard({ label, value, icon: ic, tone = 'indigo', foot = '', small = '' }) {
  return `<div class="card stat">
    <div class="stat__top">
      <span class="stat__label">${esc(label)}</span>
      <span class="stat__icon stat__icon--${tone}">${icon(ic)}</span>
    </div>
    <div class="stat__value">${value}${small ? `<small>${esc(small)}</small>` : ''}</div>
    ${foot ? `<div class="stat__foot">${foot}</div>` : ''}
  </div>`;
}

function announcementList(items, limit = 4) {
  if (!items?.length) {
    return emptyState('No announcements', 'School announcements will appear here.', 'announcements');
  }
  return `<div>${items.slice(0, limit).map((a) => `
    <div class="announce ${a.pinned ? 'announce--pinned' : ''}">
      <div class="announce__top">
        <h4>${esc(a.title)}</h4>
        ${a.pinned ? '<span class="badge badge--indigo">Pinned</span>' : ''}
        <span class="badge badge--slate badge--plain">${esc(a.audience === 'all' ? 'Everyone' : a.audience)}</span>
      </div>
      <p>${esc(a.body.length > 170 ? a.body.slice(0, 170) + '…' : a.body)}</p>
      <div class="announce__meta">
        <span>${esc(a.author || 'School office')}</span>
        <span>·</span>
        <span>${esc(a.ago || dateShort(a.created_at))}</span>
      </div>
    </div>`).join('')}</div>`;
}

/* ══════════════════════════════════════════════════════════
   Admin dashboard
   ══════════════════════════════════════════════════════════ */

function adminView(d) {
  const att = d.attendance || {};
  const fee = d.fees || {};
  const genderSegments = [
    { label: 'Girls', value: (d.gender || []).find((g) => g.gender === 'F')?.n || 0, color: '#8b5cf6' },
    { label: 'Boys', value: (d.gender || []).find((g) => g.gender === 'M')?.n || 0, color: '#0ea5e9' },
  ];

  return `
  ${pageHead(
    `${greeting()}, ${esc(firstName())}`,
    `Here is what is happening at Greenfield Academy — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    `<button class="btn" data-go="reports">${icon('reports')} Reports</button>
     <button class="btn btn--primary" data-new-announcement>${icon('plus')} Announcement</button>`,
  )}

  <div class="grid grid--4">
    ${statCard({
    label: 'Total students', value: d.counts.students, icon: 'students', tone: 'indigo',
    foot: `<span>${d.counts.classes} classes · ${d.counts.subjects} subjects</span>`,
  })}
    ${statCard({
    label: 'Teaching staff', value: d.counts.teachers, icon: 'teacher', tone: 'sky',
    foot: '<span>Across all year groups</span>',
  })}
    ${statCard({
    label: 'Attendance', value: att.rate == null ? '—' : pct(att.rate), icon: 'attendance',
    tone: att.rate >= 90 ? 'green' : att.rate >= 75 ? 'amber' : 'red',
    foot: `<span>${att.present || 0}/${att.total || 0} present · ${dateTiny(att.date)}</span>`,
  })}
    ${statCard({
    label: 'Fees collected', value: compactMoney(fee.paid), icon: 'fees', tone: 'green',
    foot: `<span><b>${pct(fee.rate)}</b> of ${compactMoney(fee.billed)} billed</span>`,
  })}
  </div>

  ${(d.sections || []).length ? `<div class="section-strip mt-2">
    ${d.sections.map((s) => `
      <div class="card row-link" data-section="${s.id}" style="cursor:pointer">
        <div class="card__body">
          <div class="inline" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="inline" style="margin-bottom:3px">
                <h3 style="font-size:16px">${esc(s.name)}</h3>
                <span class="badge badge--slate badge--plain">${esc(s.code || '')}</span>
              </div>
              <p class="small muted">${s.head ? `Head: ${esc(s.head)}` : 'No head assigned'} · ${s.class_count} class${s.class_count === 1 ? '' : 'es'}</p>
            </div>
            ${s.head ? avatar(s.head, s.head_color || '#0ea5e9', 'sm', s.head_photo) : `<span class="stat__icon stat__icon--indigo">${icon('sections')}</span>`}
          </div>
          <div class="grid grid--3" style="gap:10px;margin-top:14px">
            <div><div class="small muted">Students</div><div class="strong" style="font-size:16px">${s.student_count}</div></div>
            <div><div class="small muted">Average</div><div class="strong" style="font-size:16px">${pct(s.average, 1)}</div></div>
            <div><div class="small muted">Attendance</div><div class="strong" style="font-size:16px">${pct(s.attendanceRate)}</div></div>
          </div>
          <div class="inline small muted" style="justify-content:space-between;margin-top:10px">
            <span>${s.feeBalance > 0 ? money(s.feeBalance) + ' outstanding' : 'Fees settled'}</span>
            <span>View section →</span>
          </div>
        </div>
      </div>`).join('')}
  </div>` : ''}

  <div class="grid grid--2-1 mt-2">
    <div class="card">
      <div class="card__head">
        <div class="grow">
          <h3>Attendance trend</h3>
          <p>Whole-school rate over the last 10 school days</p>
        </div>
        <span class="badge badge--green">${att.rate == null ? '—' : pct(att.rate)} · ${dateTiny(att.date)}</span>
      </div>
      <div class="card__body">${areaChart(d.trend || [])}</div>
    </div>

    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Student body</h3><p>${d.counts.students} enrolled learners</p></div>
      </div>
      <div class="card__body">
        ${donut(genderSegments, {
    centerValue: String(d.counts.students), centerLabel: 'students',
  })}
        <div class="divider"></div>
        <div class="metric-row"><span class="muted">School average</span>
          <div class="bar"><span style="width:${Math.min(100, d.average || 0)}%"></span></div>
          <span>${pct(d.average, 1)}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="grid grid--2-1 mt-2">
    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Class performance</h3><p>Average score by class this term</p></div>
        <button class="btn btn--ghost btn--sm" data-go="reports">View reports ${icon('chevronRight')}</button>
      </div>
      <div class="card__body">
        ${(d.classes || []).length
    ? metricBars(d.classes.map((c) => ({
      label: `${c.name} (${c.students})`, value: c.pct, display: pct(c.pct, 1),
    })))
    : emptyState('No classes yet', 'Create a class to start tracking performance.', 'classes')}
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Top students</h3><p>Highest overall averages</p></div>
      </div>
      <div class="list">
        ${(d.topStudents || []).length ? d.topStudents.map((s, i) => `
          <div class="list__item" data-student="${s.id}" style="cursor:pointer">
            <span class="badge badge--plain badge--${i === 0 ? 'amber' : 'slate'}" style="min-width:26px;justify-content:center">${i + 1}</span>
            ${avatar(s.name, s.color || ['#4f46e5', '#0ea5e9', '#10b981', '#8b5cf6', '#ec4899'][i % 5], 'sm', s.photo)}
            <div class="list__text">
              <strong>${esc(s.name)}</strong>
              <span>${esc(s.class_name || '—')}</span>
            </div>
            <div class="right">${gradeBadge(s.pct >= 80 ? 'A' : s.pct >= 70 ? 'B' : s.pct >= 60 ? 'C' : 'D')}
              <div class="small muted" style="margin-top:3px">${pct(s.pct, 1)}</div>
            </div>
          </div>`).join('') : emptyState('No results yet', 'Grades will appear once teachers record them.', 'grades')}
      </div>
    </div>
  </div>

  <div class="grid grid--2 mt-2">
    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Announcements</h3><p>Latest notices from the school office</p></div>
        <button class="btn btn--ghost btn--sm" data-go="announcements">All ${icon('chevronRight')}</button>
      </div>
      ${announcementList(d.announcements, 3)}
    </div>

    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Fee follow-ups</h3><p>Invoices still outstanding</p></div>
        <button class="btn btn--ghost btn--sm" data-go="fees">All ${icon('chevronRight')}</button>
      </div>
      ${(d.outstandingFees || []).length ? `<div class="list">
        ${d.outstandingFees.map((f) => `
          <div class="list__item">
            <div class="list__text">
              <strong>${esc(f.student)}</strong>
              <span>${esc(f.description)} · ${esc(f.class_name || '—')}</span>
            </div>
            <div class="right">
              <div class="strong" style="font-size:12.5px">${money(f.amount - f.paid)}</div>
              <div class="small muted">due ${dateShort(f.due_date)}</div>
            </div>
          </div>`).join('')}
      </div>` : emptyState('All fees settled', 'There are no outstanding invoices right now.', 'check')}
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   Teacher dashboard
   ══════════════════════════════════════════════════════════ */

function teacherView(d) {
  const att = d.attendance || {};
  return `
  ${pageHead(
    `${greeting()}, ${esc(firstName())}`,
    `${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · Here is your teaching day.`,
    `<button class="btn" data-go="grades">${icon('grades')} Enter grades</button>
     <button class="btn btn--primary" data-go="attendance">${icon('attendance')} Take attendance</button>`,
  )}

  <div class="grid grid--4">
    ${statCard({ label: 'My classes', value: d.classes.length, icon: 'classes', tone: 'indigo', foot: '<span>Form or subject classes</span>' })}
    ${statCard({ label: 'My subjects', value: d.subjects.length, icon: 'book', tone: 'violet', foot: `<span>${d.studentCount} students in total</span>` })}
    ${statCard({
    label: 'Attendance', value: att.rate == null ? '—' : pct(att.rate), icon: 'attendance',
    tone: att.rate >= 90 ? 'green' : att.rate >= 75 ? 'amber' : 'red',
    foot: `<span>${att.present || 0}/${att.total || 0} present · ${dateTiny(att.date)}</span>`,
  })}
    ${statCard({
    label: 'Class average', value: pct(d.average, 1), icon: 'percent', tone: 'sky',
    foot: d.pending ? `<span><b class="down">${d.pending}</b> students unmarked</span>` : '<span>All registers up to date</span>',
  })}
  </div>

  <div class="grid grid--2-1 mt-2">
    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Today's schedule</h3><p>Lessons assigned to you</p></div>
        <button class="btn btn--ghost btn--sm" data-go="timetable">Timetable ${icon('chevronRight')}</button>
      </div>
      ${d.schedule.length ? `<div class="list">
        ${d.schedule.map((s) => `
          <div class="list__item">
            <div class="stat__icon stat__icon--indigo" style="width:40px;height:40px;border-radius:10px">
              ${icon('clock')}
            </div>
            <div class="list__text">
              <strong>${esc(s.subject)} · ${esc(s.class_name)}</strong>
              <span>${esc(s.start_time)} – ${esc(s.end_time)}${s.room ? ` · ${esc(s.room)}` : ''}</span>
            </div>
            <span class="badge badge--slate badge--plain">Lesson</span>
          </div>`).join('')}
      </div>` : emptyState('No lessons today', 'Enjoy the planning time — check your full timetable for the week.', 'calendar')}
    </div>

    <div class="card">
      <div class="card__head"><div class="grow"><h3>Attendance</h3><p>Latest school day</p></div></div>
      <div class="card__body">
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:34px;font-weight:750;letter-spacing:-.03em">${att.rate == null ? '—' : pct(att.rate)}</span>
          <span class="muted small">present</span>
        </div>
        <div class="bar bar--green mt-1"><span style="width:${att.rate || 0}%"></span></div>
        <div class="att-summary mt-2">
          <span class="att-pill"><i style="background:#10b981"></i>Present <b>${att.present || 0}</b></span>
          <span class="att-pill"><i style="background:#e2e8f0"></i>Total <b>${att.total || 0}</b></span>
        </div>
        ${d.pending ? `<div class="note mt-2"><b>${d.pending}</b> student${d.pending === 1 ? '' : 's'} not marked for ${dateShort(att.date)}. <a href="#/attendance">Complete the register →</a></div>`
      : `<div class="note mt-2">All registers are complete for ${dateShort(att.date)}.</div>`}
      </div>
    </div>
  </div>

  <div class="grid grid--2 mt-2">
    <div class="card">
      <div class="card__head"><div class="grow"><h3>My classes</h3><p>Tap a class to view students</p></div></div>
      <div class="list">
        ${d.classes.length ? d.classes.map((c) => `
          <div class="list__item row-link" data-class="${c.id}">
            <div class="stat__icon stat__icon--indigo">${icon('classes')}</div>
            <div class="list__text"><strong>${esc(c.name)}</strong><span>${c.section_name ? esc(c.section_name) + ' · ' : ''}${esc(c.level)} · ${esc(c.room || 'No room')}</span></div>
            ${icon('chevronRight')}
          </div>`).join('') : emptyState('No classes assigned', 'Ask an administrator to assign you to a class.', 'classes')}
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Announcements</h3><p>Notices for staff</p></div>
        <button class="btn btn--ghost btn--sm" data-go="announcements">All ${icon('chevronRight')}</button>
      </div>
      ${announcementList(d.announcements, 3)}
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   Student dashboard
   ══════════════════════════════════════════════════════════ */

function studentView(d) {
  const s = d.student;
  const sum = d.summary || {};
  return `
  ${pageHead(
    `${greeting()}, ${esc(firstName())}`,
    `${esc(s.class_name || '')} · ${esc(state.meta?.term || '')}`,
    `<button class="btn" data-go="grades">${icon('grades')} My results</button>`,
  )}

  <div class="card hero">
    <div class="hero__main">
      <div class="hero__identity">
        ${avatar(s.name, s.color || '#4f46e5', 'xl', s.photo)}
        <div>
          <span class="badge badge--indigo badge--plain">${esc(s.class_name || 'Unassigned')}</span>
          ${s.section_name ? `<span class="badge badge--violet badge--plain">${esc(s.section_name)}</span>` : ''}
          <h2>${esc(s.name)}</h2>
          <p class="muted small">${esc(s.admission_no)} · Form teacher: ${esc(s.form_teacher || '—')}</p>
        </div>
      </div>
      <div class="hero__stats">
        <div><span>Overall average</span><strong>${pct(sum.average, 1)}</strong><em>${esc(sum.grade || '—')}</em></div>
        <div><span>Attendance</span><strong>${pct(sum.attendanceRate)}</strong><em>${sum.daysPresent || 0} of ${sum.daysRecorded || 0} days</em></div>
        <div><span>Fee balance</span><strong style="font-size:19px">${money(d.feeBalance)}</strong><em>${d.feeBalance > 0 ? 'Outstanding' : 'All settled'}</em></div>
      </div>
    </div>
    <div class="hero__strip">
      <a href="#/timetable">${icon('timetable')} Timetable</a>
      <a href="#/grades">${icon('grades')} Results</a>
      <a href="#/fees">${icon('fees')} Fees</a>
      <a href="#/announcements">${icon('announcements')} Notices</a>
    </div>
  </div>

  <div class="grid grid--2-1 mt-2">
    <div class="card">
      <div class="card__head"><div class="grow"><h3>Subject performance</h3><p>Average across all assessments this term</p></div>
        ${gradeBadge(sum.grade)}</div>
      <div class="card__body">
        ${d.subjects.length ? metricBars(d.subjects.map((x) => ({ label: x.subject, value: x.pct, display: pct(x.pct, 1) })))
    : emptyState('No results yet', 'Your results will appear here once your teachers publish them.', 'grades')}
      </div>
    </div>

    <div class="card">
      <div class="card__head"><div class="grow"><h3>Today's lessons</h3><p>${new Date().toLocaleDateString('en-GB', { weekday: 'long' })}</p></div></div>
      ${d.schedule.length ? `<div class="list">
        ${d.schedule.map((x) => `
          <div class="list__item">
            <div class="list__text">
              <strong>${esc(x.subject)}</strong>
              <span>${esc(x.start_time)} – ${esc(x.end_time)} · ${esc(x.teacher || '—')}</span>
            </div>
            <span class="badge badge--slate badge--plain">${esc(x.room || '')}</span>
          </div>`).join('')}
      </div>` : emptyState('No lessons today', 'Check your timetable for the rest of the week.', 'calendar')}
    </div>
  </div>

  <div class="grid grid--2 mt-2">
    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Attendance</h3><p>Your recent school days</p></div>
        <span class="badge ${sum.attendanceRate >= 90 ? 'badge--green' : 'badge--amber'}">${pct(sum.attendanceRate)}</span>
      </div>
      <div class="card__body">
        <div class="att-summary" style="margin-bottom:16px">
          <span class="att-pill"><i style="background:#10b981"></i>Present <b>${sum.daysPresent || 0}</b></span>
          <span class="att-pill"><i style="background:#ef4444"></i>Absent <b>${sum.daysAbsent || 0}</b></span>
          <span class="att-pill"><i style="background:#e2e8f0"></i>Recorded <b>${sum.daysRecorded || 0}</b></span>
        </div>
        <div class="inline">
          ${(d.recentAttendance || []).map((a) => `<span class="badge badge--${a.status === 'present' ? 'green' : a.status === 'absent' ? 'red' : a.status === 'late' ? 'amber' : 'sky'} badge--plain" title="${esc(a.date)}">${dateTiny(a.date)}</span>`).join('') || '<span class="muted small">No records yet.</span>'}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <div class="grow"><h3>Fees</h3><p>${esc(state.meta?.term || '')}</p></div>
        <button class="btn btn--ghost btn--sm" data-go="fees">Details ${icon('chevronRight')}</button>
      </div>
      <div class="list">
        ${d.fees.slice(0, 3).map((f) => `
          <div class="list__item">
            <div class="list__text"><strong>${esc(f.description)}</strong><span>Due ${dateShort(f.due_date)}</span></div>
            <div class="right">
              <div class="strong" style="font-size:12.5px">${money(f.amount - f.paid)}</div>
              <div class="small muted">${money(f.paid)} paid</div>
            </div>
          </div>`).join('') || '<div class="table__empty">No invoices on record.</div>'}
      </div>
    </div>
  </div>

  <div class="card mt-2">
    <div class="card__head">
      <div class="grow"><h3>Announcements</h3><p>What is happening around school</p></div>
      <button class="btn btn--ghost btn--sm" data-go="announcements">All ${icon('chevronRight')}</button>
    </div>
    ${announcementList(d.announcements, 2)}
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   Render
   ══════════════════════════════════════════════════════════ */

export async function render(root) {
  const d = await get('/overview');

  if (d.role === 'admin') {
    setPageMeta('Dashboard', 'School overview');
    root.innerHTML = adminView(d);
  } else if (d.role === 'teacher') {
    setPageMeta('Dashboard', 'Your teaching overview');
    root.innerHTML = teacherView(d);
  } else {
    setPageMeta('Dashboard', 'Your school at a glance');
    root.innerHTML = studentView(d);
  }

  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });
  root.querySelectorAll('[data-student]').forEach((row) => {
    row.addEventListener('click', () => navigate(`students/${row.dataset.student}`));
  });
  root.querySelectorAll('[data-class]').forEach((row) => {
    row.addEventListener('click', () => navigate(`classes?class=${row.dataset.class}`));
  });
  root.querySelectorAll('[data-section]').forEach((row) => {
    row.addEventListener('click', () => navigate(`sections?section=${row.dataset.section}`));
  });
  root.querySelector('[data-new-announcement]')?.addEventListener('click', () => navigate('announcements?new=1'));
}
