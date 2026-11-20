import { get } from '../api.js';
import { state } from '../store.js';
import {
  esc, icon, money, compactMoney, pct, gradeBadge, pageHead, setPageMeta, emptyState,
  areaChart, donut, metricBars, toast,
} from '../ui.js';
import { downloadPdf } from '../pdf.js?v=12';
import { buildClassOverview, buildClassResults, buildFinanceReport } from '../documents.js?v=12';

let tab = 'classes';
let activeClass = null;

export async function render(root) {
  setPageMeta('Reports', 'Class performance and fee collection');

  root.innerHTML = `
    ${pageHead('Reports', 'Performance, attendance and finance at a glance',
    `<button class="btn" id="print-report">${icon('printer')} Print</button>`)}
    <div class="tabs">
      <button data-tab="classes" class="${tab === 'classes' ? 'is-active' : ''}">Class performance</button>
      <button data-tab="finance" class="${tab === 'finance' ? 'is-active' : ''}">Finance</button>
    </div>
    <div id="report-panel"><div class="card"><div class="card__body"><div class="skeleton" style="height:240px"></div></div></div></div>`;

  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      activeClass = null;
      root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
      load();
    });
  });
  document.getElementById('print-report')?.addEventListener('click', async () => {
    try {
      if (tab === 'finance') {
        const finance = await get('/reports/finance');
        downloadPdf(buildFinanceReport({ finance }), 'finance-report.pdf', 'Finance report ready.');
        return;
      }
      if (activeClass) {
        const [report, students] = await Promise.all([
          get(`/reports/class/${activeClass}`),
          get(`/students?class_id=${activeClass}`),
        ]);
        downloadPdf(buildClassResults({ report, students }),
          `class-results-${report.class.name.replace(/\s/g, '-')}.pdf`, 'Class report ready.');
        return;
      }
      const list = await get('/reports/classes');
      downloadPdf(buildClassOverview({ list }), 'class-performance.pdf', 'Class performance report ready.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  async function load() {
    const panel = document.getElementById('report-panel');
    panel.innerHTML = '<div class="card"><div class="card__body"><div class="skeleton" style="height:240px"></div></div></div>';
    try {
      if (tab === 'finance') await renderFinance(panel);
      else if (activeClass) await renderClassReport(panel, activeClass);
      else await renderClasses(panel);
    } catch (err) {
      panel.innerHTML = `<div class="card"><div class="table__empty">${esc(err.message)}</div></div>`;
    }
  }

  async function renderClasses(panel) {
    const list = await get('/reports/classes');
    if (!list.length) {
      panel.innerHTML = `<div class="card">${emptyState('No classes', 'Create classes to see reports.', 'classes')}</div>`;
      return;
    }
    const avg = list.reduce((n, c) => n + (c.average || 0), 0) / list.length;
    const att = list.reduce((n, c) => n + (c.attendanceRate || 0), 0) / list.length;

    panel.innerHTML = `
      <div class="grid grid--4">
        <div class="card stat"><div class="stat__top"><span class="stat__label">Classes</span><span class="stat__icon stat__icon--indigo">${icon('classes')}</span></div>
          <div class="stat__value">${list.length}</div><div class="stat__foot"><span>${list.reduce((n, c) => n + c.student_count, 0)} students</span></div></div>
        <div class="card stat"><div class="stat__top"><span class="stat__label">Average score</span><span class="stat__icon stat__icon--violet">${icon('percent')}</span></div>
          <div class="stat__value">${pct(avg, 1)}</div><div class="stat__foot"><span>Across all classes</span></div></div>
        <div class="card stat"><div class="stat__top"><span class="stat__label">Attendance</span><span class="stat__icon stat__icon--green">${icon('attendance')}</span></div>
          <div class="stat__value">${pct(att)}</div><div class="stat__foot"><span>Term to date</span></div></div>
        <div class="card stat"><div class="stat__top"><span class="stat__label">Fees outstanding</span><span class="stat__icon stat__icon--amber">${icon('fees')}</span></div>
          <div class="stat__value" style="font-size:22px">${compactMoney(list.reduce((n, c) => n + c.feeBalance, 0))}</div><div class="stat__foot"><span>All classes</span></div></div>
      </div>

      <div class="grid grid--2 mt-2">
        ${list.map((c) => `
          <div class="card row-link" data-class="${c.id}" style="cursor:pointer">
            <div class="card__body">
              <div class="inline" style="justify-content:space-between;align-items:flex-start">
                <div>
                  <h3 style="font-size:16px">${esc(c.name)}</h3>
                  <p class="small muted">${esc(c.form_teacher || 'No form teacher')} · ${c.student_count} students</p>
                </div>
                ${icon('chevronRight')}
              </div>
              <div style="margin:16px 0 12px">
                <div class="metric-row"><span class="muted">Average</span>
                  <div class="bar"><span style="width:${c.average || 0}%"></span></div><span>${pct(c.average, 1)}</span></div>
                <div class="metric-row"><span class="muted">Attendance</span>
                  <div class="bar bar--green"><span style="width:${c.attendanceRate || 0}%"></span></div><span>${pct(c.attendanceRate)}</span></div>
              </div>
              <div class="inline small muted" style="justify-content:space-between">
                <span>${c.feeBalance > 0 ? money(c.feeBalance) + ' outstanding' : 'Fees settled'}</span>
                <span>View report →</span>
              </div>
            </div>
          </div>`).join('')}
      </div>`;

    panel.querySelectorAll('[data-class]').forEach((card) => {
      card.addEventListener('click', () => {
        activeClass = card.dataset.class;
        load();
      });
    });
  }

  async function renderClassReport(panel, id) {
    const r = await get(`/reports/class/${id}`);
    const dist = r.distribution || {};
    const totalDist = Object.values(dist).reduce((a, b) => a + b, 0);

    panel.innerHTML = `
      <div class="inline" style="margin-bottom:14px">
        <button class="btn btn--ghost btn--sm" id="back-classes">${icon('arrowLeft')} All classes</button>
      </div>

      <div class="card">
        <div class="card__body">
          <div class="inline" style="justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div class="inline"><h2 style="font-size:21px">${esc(r.class.name)}</h2>
                <span class="badge badge--indigo">${esc(r.class.level)}</span>
                ${r.class.section_name ? `<span class="badge badge--violet">${esc(r.class.section_name)}</span>` : ''}</div>
              <p class="small muted" style="margin-top:3px">${esc(r.class.form_teacher || 'No form teacher')} · ${r.class.student_count} students · ${esc(r.class.room || '')}</p>
            </div>
            <div class="inline">
              <span class="badge badge--green">${pct(r.class.average, 1)} average</span>
              <span class="badge badge--sky">${pct(r.class.attendanceRate)} attendance</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid--2-1 mt-2">
        <div class="card">
          <div class="card__head"><div class="grow"><h3>Subject averages</h3><p>How each subject is performing</p></div></div>
          <div class="card__body">${r.subjects.length
        ? metricBars(r.subjects.map((s) => ({ label: s.name, value: s.pct, display: pct(s.pct, 1) })))
        : emptyState('No scores yet', 'Teachers have not entered grades for this class.', 'grades')}</div>
        </div>
        <div class="card">
          <div class="card__head"><div class="grow"><h3>Grade spread</h3><p>${totalDist} assessment scores</p></div></div>
          <div class="card__body">
            ${donut([
        { label: 'A (80+)', value: dist.A || 0, color: '#10b981' },
        { label: 'B (70–79)', value: dist.B || 0, color: '#4f46e5' },
        { label: 'C (60–69)', value: dist.C || 0, color: '#0ea5e9' },
        { label: 'D (50–59)', value: dist.D || 0, color: '#f59e0b' },
        { label: 'E/F', value: (dist.E || 0) + (dist.F || 0), color: '#ef4444' },
      ], { centerValue: String(r.class.student_count), centerLabel: 'students' })}
          </div>
        </div>
      </div>

      <div class="grid grid--2 mt-2">
        <div class="card">
          <div class="card__head"><div class="grow"><h3>Top students</h3><p>Highest term averages</p></div></div>
          <div class="list">
            ${r.topStudents.length ? r.topStudents.map((s, i) => `
              <div class="list__item">
                <span class="badge badge--plain badge--${i === 0 ? 'amber' : 'slate'}" style="min-width:24px;justify-content:center">${i + 1}</span>
                <div class="list__text"><strong>${esc(s.name)}</strong><span>Overall average</span></div>
                <div class="right">${gradeBadge(s.grade)}<div class="small muted" style="margin-top:2px">${pct(s.pct, 1)}</div></div>
              </div>`).join('') : '<div class="table__empty">No scores recorded.</div>'}
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div class="grow"><h3>Attendance trend</h3><p>Last 10 school days</p></div></div>
          <div class="card__body">${areaChart(r.trend || [])}</div>
        </div>
      </div>`;

    document.getElementById('back-classes')?.addEventListener('click', () => {
      activeClass = null;
      load();
    });
  }

  async function renderFinance(panel) {
    const f = await get('/reports/finance');
    const t = f.totals || {};
    const s = f.statuses || {};
    const rate = t.billed ? (t.paid / t.billed) * 100 : 0;

    panel.innerHTML = `
      <div class="grid grid--4">
        <div class="card stat"><div class="stat__top"><span class="stat__label">Billed this term</span><span class="stat__icon stat__icon--indigo">${icon('fees')}</span></div>
          <div class="stat__value" style="font-size:22px">${compactMoney(t.billed)}</div><div class="stat__foot"><span>${s.total || 0} invoices</span></div></div>
        <div class="card stat"><div class="stat__top"><span class="stat__label">Collected</span><span class="stat__icon stat__icon--green">${icon('check')}</span></div>
          <div class="stat__value" style="font-size:22px">${compactMoney(t.paid)}</div><div class="stat__foot"><span><b>${pct(rate)}</b> of billed</span></div></div>
        <div class="card stat"><div class="stat__top"><span class="stat__label">Outstanding</span><span class="stat__icon stat__icon--amber">${icon('wallet')}</span></div>
          <div class="stat__value" style="font-size:22px">${compactMoney(t.balance)}</div><div class="stat__foot"><span>To be recovered</span></div></div>
        <div class="card stat"><div class="stat__top"><span class="stat__label">Fully paid</span><span class="stat__icon stat__icon--sky">${icon('percent')}</span></div>
          <div class="stat__value">${s.paid || 0}</div><div class="stat__foot"><span>${s.partial || 0} part paid · ${s.unpaid || 0} unpaid</span></div></div>
      </div>

      <div class="grid grid--2-1 mt-2">
        <div class="card">
          <div class="card__head"><div class="grow"><h3>Collection by class</h3><p>Paid against billed, per class</p></div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Class</th><th class="num">Students</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th><th>Progress</th></tr></thead>
            <tbody>${(f.byClass || []).map((c) => {
      const p = c.billed ? (c.paid / c.billed) * 100 : 0;
      return `<tr>
                <td class="strong">${esc(c.name || 'Unassigned')}</td>
                <td class="num">${c.students}</td>
                <td class="num">${money(c.billed)}</td>
                <td class="num">${money(c.paid)}</td>
                <td class="num strong">${money(c.balance)}</td>
                <td style="min-width:120px"><div class="bar bar--${p >= 75 ? 'green' : p >= 40 ? '' : 'amber'}"><span style="width:${Math.min(100, p)}%"></span></div>
                  <div class="small muted" style="margin-top:3px">${pct(p)}</div></td>
              </tr>`;
    }).join('')}</tbody>
          </table></div>
        </div>

        <div class="card">
          <div class="card__head"><div class="grow"><h3>Invoice status</h3><p>All invoices this term</p></div></div>
          <div class="card__body">
            ${donut([
      { label: 'Paid', value: s.paid || 0, color: '#10b981' },
      { label: 'Part paid', value: s.partial || 0, color: '#f59e0b' },
      { label: 'Unpaid', value: s.unpaid || 0, color: '#ef4444' },
    ], { centerValue: String(s.total || 0), centerLabel: 'invoices' })}
            <div class="note mt-2">Collection rate is <b>${pct(rate)}</b>. ${(t.balance || 0) > 0 ? `${money(t.balance)} remains outstanding.` : 'Every invoice is settled.'}</div>
          </div>
        </div>
      </div>`;
  }

  await load();
}
