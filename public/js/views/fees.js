import { get, post, del } from '../api.js';
import { state, refresh, classes, isAdmin, isStaff } from '../store.js';
import {
  esc, icon, money, compactMoney, pct, dateShort, feeBadge, pageHead, setPageMeta,
  emptyState, openModal, confirmDialog, formFields, toast,
} from '../ui.js';
import { downloadPdf } from '../pdf.js?v=11';
import { buildFeeStatement } from '../documents.js?v=11';

const filters = { class_id: '', q: '', status: '' };

function statusOf(f) {
  if (f.paid >= f.amount) return 'paid';
  if (f.paid > 0) return 'partial';
  return f.status === 'overdue' ? 'overdue' : 'unpaid';
}

function exportCsv(list) {
  const header = ['Student', 'Class', 'Item', 'Amount', 'Paid', 'Balance', 'Due date', 'Status'];
  const lines = [header.join(',')];
  list.forEach((f) => {
    lines.push([
      f.student, f.class_name || '', f.description, f.amount, f.paid,
      f.amount - f.paid, f.due_date || '', statusOf(f),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'greenfield-fees.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Fee schedule exported.');
}

/* ══════════════════════════════════════════════════════════
   Student view
   ══════════════════════════════════════════════════════════ */

function renderStudent(root, data) {
  const fees = data.fees || [];
  const billed = fees.reduce((n, f) => n + f.amount, 0);
  const paid = fees.reduce((n, f) => n + f.paid, 0);
  const balance = billed - paid;
  setPageMeta('My fees', `${state.meta?.term || ''} · ${balance > 0 ? money(balance) + ' outstanding' : 'fully settled'}`);

  root.innerHTML = `
    ${pageHead('My fees', 'Invoices and payment status for this term',
    `<button class="btn" id="print-statement">${icon('printer')} Print statement</button>`)}
    <div class="grid grid--3">
      <div class="card stat"><div class="stat__top"><span class="stat__label">Total billed</span><span class="stat__icon stat__icon--indigo">${icon('fees')}</span></div>
        <div class="stat__value" style="font-size:23px">${money(billed)}</div><div class="stat__foot"><span>${fees.length} invoice${fees.length === 1 ? '' : 's'}</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Paid so far</span><span class="stat__icon stat__icon--green">${icon('check')}</span></div>
        <div class="stat__value" style="font-size:23px">${money(paid)}</div><div class="stat__foot"><span>${pct(billed ? (paid / billed) * 100 : 0)} of total</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Outstanding</span><span class="stat__icon stat__icon--${balance > 0 ? 'amber' : 'green'}">${icon('wallet')}</span></div>
        <div class="stat__value" style="font-size:23px">${money(balance)}</div><div class="stat__foot"><span>${balance > 0 ? 'Payable to the bursary' : 'All settled — thank you'}</span></div></div>
    </div>

    <div class="card mt-2">
      <div class="card__head"><div class="grow"><h3>Payment progress</h3><p>${esc(state.meta?.term || '')}</p></div>
        <span class="badge badge--${balance > 0 ? 'amber' : 'green'}">${pct(billed ? (paid / billed) * 100 : 100)} paid</span></div>
      <div class="card__body">
        <div class="bar bar--green" style="height:10px"><span style="width:${billed ? Math.min(100, (paid / billed) * 100) : 0}%"></span></div>
        <div class="inline" style="justify-content:space-between;margin-top:8px">
          <span class="small muted">${money(paid)} paid</span>
          <span class="small muted">${money(billed)} billed</span>
        </div>
      </div>
    </div>

    <div class="card mt-2">
      <div class="card__head"><div class="grow"><h3>Invoices</h3><p>All items for this term</p></div></div>
      ${fees.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Item</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>${fees.map((f) => `<tr>
          <td class="strong">${esc(f.description)}</td>
          <td class="num">${money(f.amount)}</td>
          <td class="num">${money(f.paid)}</td>
          <td class="num ${f.amount - f.paid > 0 ? 'strong' : ''}">${money(f.amount - f.paid)}</td>
          <td>${dateShort(f.due_date)}</td>
          <td>${feeBadge(statusOf(f))}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<div class="table__empty">No invoices on record.</div>'}
      <div class="card__foot"><span>Payments are recorded by the bursary. Bring your receipt if a payment is missing.</span></div>
    </div>`;

  document.getElementById('print-statement')?.addEventListener('click', async () => {
    try {
      const detail = await get(`/students/${state.user.student_id}`);
      downloadPdf(buildFeeStatement({ student: detail.student, fees: detail.fees }),
        `fee-statement-${detail.student.admission_no.replace(/\//g, '-')}.pdf`, 'Fee statement ready.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ══════════════════════════════════════════════════════════
   Staff view
   ══════════════════════════════════════════════════════════ */

function payModal(fee) {
  const balance = fee.amount - fee.paid;
  openModal({
    title: 'Record a payment',
    subtitle: `${fee.student} · ${fee.description}`,
    body: `
      <div class="note" style="margin-bottom:16px">
        Invoice <b>${money(fee.amount)}</b> · paid <b>${money(fee.paid)}</b> · outstanding <b>${money(balance)}</b>
      </div>
      ${formFields([
      { name: 'amount', label: 'Amount received', type: 'number', min: 1, max: balance, step: '0.01', required: true, value: balance, hint: `Maximum ${money(balance)}` },
    ])}`,
    submitLabel: 'Record payment',
    onSubmit: async (data) => {
      await post(`/fees/${fee.id}/payments`, { amount: Number(data.amount) });
      toast(`Payment of ${money(Number(data.amount))} recorded.`);
      refresh();
    },
  });
}

function invoiceModal() {
  get('/students').then((list) => {
    openModal({
      title: 'Raise an invoice',
      subtitle: 'Bill a student for fees, books or an activity.',
      body: formFields([
        {
          name: 'student_id', label: 'Student', type: 'select', required: true,
          options: list.map((s) => ({ value: s.id, label: `${s.name} — ${s.class_name || 'Unassigned'}` })),
          placeholder: 'Choose a student',
        },
        { name: 'description', label: 'Description', required: true, placeholder: 'e.g. Second term tuition' },
        { name: 'amount', label: 'Amount (₦)', type: 'number', min: 1, required: true, placeholder: '0' },
        { name: 'due_date', label: 'Due date', type: 'date' },
        { name: 'term', label: 'Term', value: state.meta?.term || '', full: true },
      ]),
      submitLabel: 'Raise invoice',
      wide: true,
      onSubmit: async (data) => {
        await post('/fees', data);
        toast('Invoice raised.');
        refresh();
      },
    });
  }).catch((err) => toast(err.message, 'error'));
}

async function renderStaff(root, data) {
  const all = data.fees || [];
  const filtered = all.filter((f) => {
    if (filters.class_id && String(f.class_id) !== String(filters.class_id)) return false;
    if (filters.status && statusOf(f) !== filters.status) return false;
    if (filters.q) {
      const hay = `${f.student} ${f.admission_no || ''} ${f.description}`.toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  });

  const totals = data.totals || { billed: 0, paid: 0, balance: 0 };
  const rate = totals.billed ? (totals.paid / totals.billed) * 100 : 0;
  const overdue = all.filter((f) => f.status === 'overdue').length;

  setPageMeta(isAdmin() ? 'Fees' : 'Fee status', `${money(totals.balance)} outstanding across the school`);

  root.innerHTML = `
    ${pageHead(isAdmin() ? 'Fees & payments' : 'Fee status', 'Invoices, payments and outstanding balances',
    `${isAdmin() ? `<button class="btn" id="export-fees">${icon('download')} Export</button>
      <button class="btn btn--primary" id="raise-invoice">${icon('plus')} Raise invoice</button>` : ''}`)}

    <div class="grid grid--4">
      <div class="card stat"><div class="stat__top"><span class="stat__label">Total billed</span><span class="stat__icon stat__icon--indigo">${icon('fees')}</span></div>
        <div class="stat__value" style="font-size:23px">${compactMoney(totals.billed)}</div><div class="stat__foot"><span>${all.length} invoices</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Collected</span><span class="stat__icon stat__icon--green">${icon('check')}</span></div>
        <div class="stat__value" style="font-size:23px">${compactMoney(totals.paid)}</div><div class="stat__foot"><span><b>${pct(rate)}</b> collection rate</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Outstanding</span><span class="stat__icon stat__icon--amber">${icon('wallet')}</span></div>
        <div class="stat__value" style="font-size:23px">${compactMoney(totals.balance)}</div><div class="stat__foot"><span>Across ${new Set(all.filter((f) => f.amount > f.paid).map((f) => f.student_id)).size} students</span></div></div>
      <div class="card stat"><div class="stat__top"><span class="stat__label">Overdue invoices</span><span class="stat__icon stat__icon--red">${icon('alert')}</span></div>
        <div class="stat__value">${overdue}</div><div class="stat__foot"><span>Past their due date</span></div></div>
    </div>

    <div class="card mt-2">
      <div class="card__body" style="padding:14px 16px">
        <div class="inline" style="gap:10px">
          <div class="field" style="flex:1;min-width:180px;max-width:320px">
            <div style="position:relative">
              <span class="field__search-icon">${icon('search')}</span>
              <input id="fee-search" type="search" placeholder="Search student or item" value="${esc(filters.q)}" style="padding-left:36px">
            </div>
          </div>
          <select id="fee-class" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff">
            <option value="">All classes</option>
            ${classes().map((c) => `<option value="${c.id}" ${String(filters.class_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
          <select id="fee-status" style="height:40px;border:1px solid var(--line);border-radius:9px;padding:0 30px 0 12px;background:#fff">
            <option value="">Any status</option>
            ${['paid', 'partial', 'unpaid', 'overdue'].map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
          <div class="spacer"></div>
          <span class="small muted">${filtered.length} of ${all.length}</span>
        </div>
      </div>

      ${filtered.length ? `<div class="table-wrap"><table class="table" style="min-width:820px">
        <thead><tr><th>Student</th><th>Item</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>${filtered.map((f) => `
          <tr>
            <td><div class="strong">${esc(f.student)}</div><div class="small muted">${esc(f.class_name || '—')}</div></td>
            <td><div>${esc(f.description)}</div><div class="small muted">${esc(f.term || '')}</div></td>
            <td class="num">${money(f.amount)}</td>
            <td class="num">${money(f.paid)}</td>
            <td class="num strong">${money(f.amount - f.paid)}</td>
            <td>${dateShort(f.due_date)}</td>
            <td>${feeBadge(statusOf(f))}</td>
            <td><div class="table__actions">
              <button class="icon-btn" data-statement="${f.student_id}" title="Print fee statement">${icon('printer')}</button>
              ${isAdmin() && f.paid < f.amount ? `<button class="btn btn--soft btn--sm" data-pay="${f.id}">${icon('card')} Pay</button>` : ''}
              ${isAdmin() ? `<button class="icon-btn" data-del="${f.id}" title="Delete invoice">${icon('trash')}</button>` : ''}
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="table__empty">No invoices match your filters.</div>'}
    </div>`;

  const byId = new Map(all.map((f) => [String(f.id), f]));

  let timer;
  document.getElementById('fee-search')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    const value = e.target.value;
    timer = setTimeout(() => { filters.q = value; refresh(); }, 320);
  });
  document.getElementById('fee-class')?.addEventListener('change', (e) => {
    filters.class_id = e.target.value; refresh();
  });
  document.getElementById('fee-status')?.addEventListener('change', (e) => {
    filters.status = e.target.value; refresh();
  });

  document.getElementById('raise-invoice')?.addEventListener('click', invoiceModal);
  document.getElementById('export-fees')?.addEventListener('click', () => exportCsv(filtered));

  root.querySelectorAll('[data-pay]').forEach((btn) => {
    btn.addEventListener('click', () => payModal(byId.get(btn.dataset.pay)));
  });
  root.querySelectorAll('[data-statement]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = filtered.find((f) => String(f.student_id) === String(btn.dataset.statement));
      try {
        const detail = await get(`/students/${btn.dataset.statement}`);
        downloadPdf(buildFeeStatement({ student: detail.student, fees: detail.fees }),
          `fee-statement-${detail.student.admission_no.replace(/\//g, '-')}.pdf`,
          `Statement for ${row?.student || detail.student.name} ready.`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const f = byId.get(btn.dataset.del);
      const ok = await confirmDialog({
        title: 'Delete invoice',
        message: `Delete "${f.description}" for ${f.student}? Recorded payments on it will also be lost.`,
        confirmLabel: 'Delete invoice',
      });
      if (!ok) return;
      await del(`/fees/${f.id}`);
      toast('Invoice deleted.', 'info');
      refresh();
    });
  });
}

export async function render(root) {
  const data = await get('/fees');
  if (state.user.role === 'student') return renderStudent(root, data);
  return renderStaff(root, data);
}
