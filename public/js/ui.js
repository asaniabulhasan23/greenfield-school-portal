/* ============================================================
   UI helpers: icons, formatting, modals, toasts, charts
   ============================================================ */

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  students: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  teacher: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 10v6"/>',
  classes: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  attendance: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v3h6V3"/><path d="m9 14 2 2 4-4"/>',
  grades: '<circle cx="12" cy="8" r="5"/><path d="m8.2 12.3-1.7 9L12 19l5.5 2.3-1.7-9"/>',
  timetable: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  announcements: '<path d="m3 11 18-6v14L3 13v-2Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  fees: '<path d="M20 12V8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4Z"/><path d="M2 10h20"/><circle cx="16" cy="14" r="1"/>',
  reports: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="4" width="3" height="14" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .3 2 .6 3 .7a2 2 0 0 1 1.6 2Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  edit: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9M15 8l3 3M18 5l3 3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  megaphone: '<path d="m3 11 18-6v14L3 13v-2Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  camera: '<path d="M14.5 4h-5L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4Z"/><circle cx="12" cy="13" r="3.5"/>',
  sections: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 11h.01M15 11h.01"/>',
};

export function icon(name, cls = '') {
  const inner = ICONS[name] || ICONS.info;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/* ── Formatting ─────────────────────────────────────────── */

export const initials = (name) => String(name || '?')
  .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function avatar(name, color = '#4f46e5', size = '', photo = '') {
  const cls = size ? `avatar avatar--${size}` : 'avatar';
  if (photo) {
    return `<div class="${cls} avatar--photo"><img src="${esc(photo)}" alt="${esc(name)}" loading="lazy"></div>`;
  }
  return `<div class="${cls}" style="background:${esc(color || '#4f46e5')}">${esc(initials(name))}</div>`;
}

export function money(n) {
  const v = Number(n || 0);
  return '₦' + v.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

export function compactMoney(n) {
  const v = Number(n || 0);
  if (v >= 1_000_000) return '₦' + (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (v >= 1000) return '₦' + Math.round(v / 1000) + 'k';
  return '₦' + v;
}

export function pct(n, digits = 0) {
  return n == null ? '—' : Number(n).toFixed(digits) + '%';
}

export function dateShort(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTiny(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function dayName(iso) {
  const d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

export function timeRange(start, end) {
  return `${start} – ${end}`;
}

export function gradeBadge(letter) {
  if (!letter) return '<span class="badge badge--slate">—</span>';
  const tone = letter.startsWith('A') ? 'green'
    : letter.startsWith('B') ? 'indigo'
      : letter === 'C' ? 'sky'
        : letter === 'D' ? 'amber'
          : 'red';
  return `<span class="badge badge--${tone}">${esc(letter)}</span>`;
}

export function attendanceBadge(status) {
  const map = {
    present: ['green', 'Present'],
    absent: ['red', 'Absent'],
    late: ['amber', 'Late'],
    excused: ['sky', 'Excused'],
    unmarked: ['slate', 'Not marked'],
  };
  const [tone, label] = map[status] || map.unmarked;
  return `<span class="badge badge--${tone}">${label}</span>`;
}

export function feeBadge(status) {
  const map = {
    paid: ['green', 'Paid'],
    partial: ['amber', 'Part paid'],
    unpaid: ['slate', 'Unpaid'],
    overdue: ['red', 'Overdue'],
  };
  const [tone, label] = map[status] || map.unpaid;
  return `<span class="badge badge--${tone}">${label}</span>`;
}

export function roleLabel(role) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Teacher' : 'Student';
}

/* ── Toasts ─────────────────────────────────────────────── */

export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const ic = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check';
  el.innerHTML = `${icon(ic)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, 3400);
}

/* ── Modal ──────────────────────────────────────────────── */

export function openModal({
  title, subtitle = '', body = '', submitLabel = 'Save', cancelLabel = 'Cancel',
  wide = false, danger = false, onSubmit = null, footer = true, onMount = null,
}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <form class="modal ${wide ? 'modal--wide' : ''}" novalidate>
        <div class="modal__head">
          <div class="grow">
            <h3>${esc(title)}</h3>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
        </div>
        <div class="modal__body">
          <div class="modal-error" hidden></div>
          ${body}
        </div>
        ${footer ? `
        <div class="modal__foot">
          <button type="button" class="btn" data-close>${esc(cancelLabel)}</button>
          <button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitLabel)}</button>
        </div>` : ''}
      </form>`;

    const form = backdrop.querySelector('form');
    const errorBox = backdrop.querySelector('.modal-error');
    const submitBtn = backdrop.querySelector('button[type="submit"]');
    let settled = false;

    const close = (value) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };

    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close(null);
    });
    backdrop.querySelectorAll('[data-close]').forEach((b) => {
      b.addEventListener('click', () => close(null));
    });
    document.addEventListener('keydown', onKey);

    if (onSubmit) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        const data = {};
        new FormData(form).forEach((value, key) => {
          if (data[key] === undefined) data[key] = value;
          else data[key] = [].concat(data[key], value);
        });
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.dataset.label = submitBtn.textContent;
          submitBtn.textContent = 'Saving…';
        }
        try {
          const result = await onSubmit(data, form);
          close(result === undefined ? true : result);
        } catch (err) {
          errorBox.textContent = err.message || 'Something went wrong.';
          errorBox.className = 'modal-error form-error';
          errorBox.hidden = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.label || submitLabel;
          }
        }
      });
    } else {
      form.addEventListener('submit', (e) => { e.preventDefault(); close(true); });
    }

    document.getElementById('modal-root').appendChild(backdrop);
    setTimeout(() => {
      const first = backdrop.querySelector('input:not([type=hidden]), select, textarea');
      if (first) first.focus({ preventScroll: true });
    }, 60);

    if (onMount) onMount(form, close);
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = true }) {
  return openModal({
    title,
    body: `<p class="muted" style="font-size:13.5px;line-height:1.6">${esc(message)}</p>`,
    submitLabel: confirmLabel,
    danger,
    onSubmit: () => true,
  }).then((v) => v === true);
}

/* ── Form builder ───────────────────────────────────────── */

export function fieldHtml(f, value) {
  const v = value ?? f.value ?? '';
  const span = f.full ? 'span-2' : '';
  const req = f.required ? 'required' : '';
  const common = `name="${esc(f.name)}" id="f-${esc(f.name)}" ${req}`;

  let control;
  if (f.type === 'select') {
    const options = (f.options || []).map((o) => {
      const ov = typeof o === 'object' ? o.value : o;
      const ol = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`;
    }).join('');
    control = `<select ${common}>${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : ''}${options}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea ${common} placeholder="${esc(f.placeholder || '')}" rows="${f.rows || 4}">${esc(v)}</textarea>`;
  } else {
    control = `<input ${common} type="${f.type || 'text'}"
      value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"
      ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}
      ${f.step != null ? `step="${f.step}"` : ''} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>`;
  }

  return `<label class="field ${span}">
    <span>${esc(f.label)}${f.required ? ' <em style="color:#ef4444;font-style:normal">*</em>' : ''}</span>
    ${control}
    ${f.hint ? `<span class="field__hint">${esc(f.hint)}</span>` : ''}
  </label>`;
}

export function formFields(fields, values = {}) {
  return `<div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</div>`;
}

/* ── Charts ─────────────────────────────────────────────── */

let chartSeq = 0;

export function areaChart(data, { height = 180, color = '#4f46e5' } = {}) {
  if (!data || data.length === 0) {
    return `<div class="empty" style="padding:26px"><p>No data yet.</p></div>`;
  }
  const W = 680;
  const H = height;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const id = `grad${++chartSeq}`;
  const n = data.length;

  const x = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const pts = data.map((d, i) => [x(i), y(d.rate)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const gridLines = [0, 50, 100].map((v) => `
    <line class="chart__grid" x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}"/>
    <text class="chart__label" x="${padL - 8}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`).join('');

  const labelIdx = n <= 4 ? data.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const labels = labelIdx.map((i) => `
    <text class="chart__label" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(dateTiny(data[i].date))}</text>`).join('');

  const dots = pts.map((p, i) => {
    if (n > 12 && i !== n - 1) return '';
    return `<circle class="chart__dot" cx="${p[0]}" cy="${p[1]}" r="3.5"/>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Attendance trend">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity=".22"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

export function donut(segments, { size = 128, centerLabel = '', centerValue = '' } = {}) {
  const total = segments.reduce((n, s) => n + Number(s.value || 0), 0);
  const r = 44;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const rings = segments.map((s) => {
    const frac = total ? Number(s.value || 0) / total : 0;
    const dash = `${(frac * c).toFixed(2)} ${c.toFixed(2)}`;
    const el = `<circle cx="64" cy="64" r="${r}" fill="none" stroke="${s.color}" stroke-width="14"
      stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * c).toFixed(2)}"
      transform="rotate(-90 64 64)" stroke-linecap="butt"/>`;
    offset += frac;
    return el;
  }).join('');

  const legend = segments.map((s) => `
    <div><i style="background:${s.color}"></i>${esc(s.label)}
      <b>${total ? Math.round((Number(s.value || 0) / total) * 100) : 0}%</b></div>`).join('');

  return `<div class="donut">
    <svg width="${size}" height="${size}" viewBox="0 0 128 128" role="img">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="14"/>
      ${rings}
      <text x="64" y="60" text-anchor="middle" font-size="19" font-weight="700" fill="#0f172a">${esc(centerValue)}</text>
      <text x="64" y="76" text-anchor="middle" font-size="9.5" fill="#94a3b8">${esc(centerLabel)}</text>
    </svg>
    <div class="donut__legend">${legend}</div>
  </div>`;
}

export function metricBars(items, { max = 100 } = {}) {
  return items.map((it) => {
    const v = it.value == null ? 0 : Number(it.value);
    const tone = v >= 75 ? 'green' : v >= 50 ? '' : v >= 35 ? 'amber' : 'red';
    return `<div class="metric-row">
      <span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.label)}</span>
      <div class="bar ${tone ? 'bar--' + tone : ''}"><span style="width:${Math.max(2, Math.min(100, (v / max) * 100))}%"></span></div>
      <span>${it.display != null ? esc(it.display) : pct(v)}</span>
    </div>`;
  }).join('');
}

/* ── Small view bits ────────────────────────────────────── */

export function emptyState(title, message, iconName = 'info') {
  return `<div class="empty">
    <div class="empty__icon">${icon(iconName)}</div>
    <h4>${esc(title)}</h4>
    <p>${esc(message)}</p>
  </div>`;
}

export function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head">
    <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
    ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
  </div>`;
}

export function skeletonCards(n = 4) {
  return `<div class="grid grid--4">${Array.from({ length: n }, () => `
    <div class="card stat"><div class="skeleton" style="height:12px;width:45%"></div>
    <div class="skeleton" style="height:26px;width:65%;margin-top:14px"></div>
    <div class="skeleton" style="height:10px;width:40%;margin-top:12px"></div></div>`).join('')}</div>`;
}

export function setPageMeta(title, subtitle = '') {
  const t = document.getElementById('page-title');
  const s = document.getElementById('page-subtitle');
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
}
