/* ============================================================
   Tiny PDF writer — no dependencies.
   Produces real A4 PDF files with Helvetica text, rules and
   tables. All text is folded to ASCII because only the standard
   Helvetica fonts are embedded by PDF readers.
   ============================================================ */

import { toast, openModal, esc, icon } from './ui.js';
import { post } from './api.js';

export const PAGE = { width: 595.28, height: 841.89 };

const INK = [0.10, 0.13, 0.18];
const MUTED = [0.42, 0.47, 0.55];
const LINE = [0.84, 0.87, 0.91];
const BRAND = [0.31, 0.27, 0.90];

/* ── text helpers ─────────────────────────────────────────── */

function ascii(value) {
  return String(value ?? '')
    .replace(/₦/g, 'NGN ')
    .replace(/[·•]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, (c) => {
      const d = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /^[\x20-\x7E]$/.test(d) ? d : '?';
    });
}

function pdfString(value) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function n(value) {
  return (Math.round(Number(value) * 100) / 100).toString();
}

function charWidth(c) {
  if (c === ' ') return 0.28;
  if ('iljtfrI.,;:!|\'`()[]'.includes(c)) return 0.29;
  if ('mwMW@%'.includes(c)) return 0.87;
  if (/[A-Z]/.test(c)) return 0.68;
  if (/[0-9]/.test(c)) return 0.56;
  return 0.52;
}

export function textWidth(value, size = 10) {
  let sum = 0;
  for (const c of ascii(value)) sum += charWidth(c);
  return sum * size;
}

export function fitText(value, width, size = 9) {
  const text = ascii(value);
  if (textWidth(text, size) <= width) return text;
  let out = text;
  while (out.length > 1 && textWidth(out + '...', size) > width) out = out.slice(0, -1);
  return out.trimEnd() + '...';
}

function wrapLines(value, width, size) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ── document ─────────────────────────────────────────────── */

export class PdfDoc {
  constructor({ margin = 44, title = 'Document' } = {}) {
    this.margin = margin;
    this.title = title;
    this.pages = [];
    this.page = null;
    this.y = 0;
    this.newPage();
  }

  get contentWidth() {
    return PAGE.width - this.margin * 2;
  }

  newPage() {
    this.page = [];
    this.pages.push(this.page);
    this.y = PAGE.height - this.margin - 18;
    return this;
  }

  ensure(space) {
    if (this.y - space < this.margin + 20) this.newPage();
    return this;
  }

  add(op) {
    this.page.push(op);
    return this;
  }

  text(value, x, y, {
    size = 10, bold = false, color = INK, align = 'left', width = null,
  } = {}) {
    const text = ascii(value);
    let px = x;
    if (width != null) {
      if (align === 'right') px = x + width - textWidth(text, size);
      else if (align === 'center') px = x + (width - textWidth(text, size)) / 2;
    }
    this.add(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color.join(' ')} rg 1 0 0 1 ${n(px)} ${n(y)} Tm (${pdfString(text)}) Tj ET`);
    return this;
  }

  line(x1, y1, x2, y2, { color = LINE, width = 0.6 } = {}) {
    this.add(`${color.join(' ')} RG ${width} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
    return this;
  }

  rect(x, y, w, h, { fill = null, stroke = null, width = 0.6 } = {}) {
    if (fill) this.add(`${fill.join(' ')} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);
    if (stroke) this.add(`${stroke.join(' ')} RG ${width} w ${n(x)} ${n(y)} ${n(w)} ${n(h)} re S`);
    return this;
  }

  paragraph(value, x, {
    width = this.contentWidth, size = 9.6, lineHeight = 14, color = INK,
    bold = false, align = 'left',
  } = {}) {
    for (const line of wrapLines(value, width, size)) {
      this.ensure(lineHeight);
      this.text(line, x, this.y - size, { size, bold, color, align, width });
      this.y -= lineHeight;
    }
    return this;
  }

  /** A table with a repeating header across page breaks. */
  table({
    x = this.margin, width = this.contentWidth, columns = [], rows = [],
    rowHeight = 21, headerHeight = 23, size = 8.6, headerSize = 8.2,
    zebra = true, headerFill = [0.945, 0.955, 0.975], onBreak = null,
  }) {
    const total = columns.reduce((sum, c) => sum + (c.width || 1), 0) || 1;
    const cols = columns.map((c) => ({ ...c, w: (width * (c.width || 1)) / total }));

    const drawHeader = () => {
      this.rect(x, this.y - headerHeight, width, headerHeight, { fill: headerFill });
      let cx = x;
      for (const col of cols) {
        this.text(col.label, cx + 5,
          this.y - headerHeight + headerHeight / 2 - headerSize * 0.36,
          { size: headerSize, bold: true, color: MUTED, align: col.align || 'left', width: col.w - 10 });
        cx += col.w;
      }
      this.line(x, this.y - headerHeight, x + width, this.y - headerHeight, { color: LINE, width: 0.7 });
      this.y -= headerHeight;
    };

    const breakPage = () => {
      this.newPage();
      if (onBreak) onBreak(this);
      drawHeader();
    };

    this.ensure(headerHeight + rowHeight * 2);
    drawHeader();

    rows.forEach((raw, index) => {
      const row = Array.isArray(raw) ? { cells: raw } : raw;
      if (this.y - rowHeight < this.margin + 20) breakPage();
      const top = this.y;
      if (row.fill) this.rect(x, top - rowHeight, width, rowHeight, { fill: row.fill });
      else if (zebra && index % 2 === 1) this.rect(x, top - rowHeight, width, rowHeight, { fill: [0.975, 0.98, 0.99] });

      let cx = x;
      row.cells.forEach((cell, ci) => {
        const col = cols[ci];
        if (!col) return;
        const value = cell == null ? '' : String(cell);
        this.text(fitText(value, col.w - 9, size), cx + 5,
          top - rowHeight + rowHeight / 2 - size * 0.35, {
            size,
            bold: Boolean(row.bold || col.bold),
            color: row.color || INK,
            align: col.align || 'left',
            width: col.w - 9,
          });
        cx += col.w;
      });
      this.line(x, top - rowHeight, x + width, top - rowHeight, { color: [0.90, 0.92, 0.95], width: 0.4 });
      this.y = top - rowHeight;
    });

    this.line(x, this.y, x + width, this.y, { color: [0.70, 0.74, 0.80], width: 0.8 });
    return this.y;
  }

  /** School letterhead used by every document. */
  letterhead(meta = {}, { title = '', subtitle = '' } = {}) {
    const school = meta.school || {};
    const x = this.margin;
    const width = this.contentWidth;

    this.rect(x, this.y - 6, width, 54, { fill: [0.968, 0.972, 0.995] });
    this.text(school.name || 'Greenfield Academy', x + 12, this.y + 4,
      { size: 16, bold: true, color: BRAND });
    this.text(school.motto || 'Knowledge - Integrity - Service', x + 12, this.y - 13,
      { size: 8, color: MUTED });
    this.text(school.address || '', x + width - 12, this.y + 3,
      { size: 7.6, color: MUTED, align: 'right', width: 230 });
    this.text(school.phone || '', x + width - 12, this.y - 7,
      { size: 7.6, color: MUTED, align: 'right', width: 230 });
    this.text(school.email || '', x + width - 12, this.y - 17,
      { size: 7.6, color: MUTED, align: 'right', width: 230 });
    this.y -= 66;

    if (title) {
      this.text(title, x, this.y, { size: 17, bold: true, align: 'center', width });
      this.y -= 17;
    }
    if (subtitle) {
      this.text(subtitle, x, this.y, { size: 9.2, color: MUTED, align: 'center', width });
      this.y -= 14;
    }
    this.line(x, this.y + 2, x + width, this.y + 2, { color: LINE, width: 0.8 });
    this.y -= 12;
    return this;
  }

  /** Label / value pair on one line. */
  field(label, value, x, { width = 240, labelWidth = 90, size = 9, y = null } = {}) {
    const lineY = y == null ? this.y : y;
    this.text(label, x, lineY, { size, color: MUTED });
    this.text(value || '-', x + labelWidth, lineY, { size, bold: false, width: width - labelWidth });
    return this;
  }

  /** Page-number footer, appended after all content is added. */
  finish({ footer = 'Greenfield Academy - School Portal' } = {}) {
    const total = this.pages.length;
    this.pages.forEach((ops, index) => {
      const left = ascii(footer);
      const right = ascii(`Page ${index + 1} of ${total}`);
      ops.push(`0.6 0.64 0.70 RG 0.5 w ${n(this.margin)} ${n(34)} m ${n(PAGE.width - this.margin)} ${n(34)} l S`);
      ops.push(`BT /F1 7.4 Tf 0.45 0.49 0.55 rg 1 0 0 1 ${n(this.margin)} 22 Tm (${pdfString(left)}) Tj ET`);
      ops.push(`BT /F1 7.4 Tf 0.45 0.49 0.55 rg 1 0 0 1 ${n(PAGE.width - this.margin - textWidth(right, 7.4))} 22 Tm (${pdfString(right)}) Tj ET`);
    });
    return this;
  }

  blob() {
    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    this.pages.forEach((ops, index) => {
      const pageObj = 5 + index * 2;
      const contentObj = pageObj + 1;
      const stream = ops.join('\n');
      objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] `
        + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
      objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    objects[2] = `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${this.pages.length} >>`;

    const total = 5 + this.pages.length * 2;
    let out = '%PDF-1.4\n%Greenfield Academy\n';
    const offsets = new Array(total).fill(0);
    for (let i = 1; i < total; i += 1) {
      offsets[i] = out.length;
      out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i += 1) {
      out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([out], { type: 'application/pdf' });
  }
}

/* ── delivery ─────────────────────────────────────────────── */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('The document could not be encoded.'));
    reader.readAsDataURL(blob);
  });
}

function saveWithAnchor(href, name, download = false) {
  const link = document.createElement('a');
  link.href = href;
  if (download) link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* Chrome-based WebViews expose the native file picker. Call it directly from
   the click handler (before any await) so the user gesture is still valid. */
async function saveWithPicker(blob, name) {
  if (typeof window.showSaveFilePicker !== 'function') return false;
  let handle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    return false;
  }
  try {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (err) {
    console.error('[pdf] could not write file', err);
    return false;
  }
}

export async function downloadPdf(doc, filename, message = 'PDF ready.') {
  const blob = doc.blob();
  const name = /\.pdf$/i.test(filename) ? filename : `${filename}.pdf`;

  /* Always try the real device save dialog first. */
  const saved = await saveWithPicker(blob, name);
  if (saved === true) {
    toast(`${message} Saved as ${name}.`, 'success');
    return blob;
  }

  /* If the user cancelled or the picker is unavailable, offer a fallback
     dialog with a server-backed download link. */
  let url = '';
  try {
    const data = await blobToBase64(blob);
    const result = await post('/export', { data, filename: name });
    url = result.url;
    saveWithAnchor(url, name);
  } catch (err) {
    if (err?.status === 401) toast('Your session expired. Please sign in again.', 'error');
  }
  showPdfDialog(name, url, message, blob, saved === 'cancelled');
  return blob;
}

/* In-app WebViews often ignore automatic downloads. This dialog gives the user
   a real "Save PDF" button that opens the native file picker, plus a plain link. */
function showPdfDialog(name, url, message, blob, cancelled = false) {
  openModal({
    title: /\.$/.test(message) ? message : `${message} ready`,
    subtitle: esc(name),
    footer: false,
    body: `
      <div class="pdf-dialog">
        <div class="pdf-dialog__icon">${icon('printer')}</div>
        <p>${cancelled
    ? 'Save was cancelled. Choose where to keep this document, or use the download link below.'
    : 'Choose where to save this document on your device. If the save dialog is unavailable, use the download link below.'}</p>
        <div class="inline" style="gap:8px;flex-wrap:wrap;margin-top:16px">
          <button type="button" class="btn btn--primary" id="pdf-save-btn">${icon('download')} Save PDF</button>
          ${url ? `<a class="btn" href="${esc(url)}">${icon('file')} Download link</a>` : ''}
          <button type="button" class="btn btn--ghost" data-close>Done</button>
        </div>
      </div>`,
    onMount: (form) => {
      form.querySelector('#pdf-save-btn')?.addEventListener('click', async () => {
        const btn = form.querySelector('#pdf-save-btn');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        const result = await saveWithPicker(blob, name);
        btn.disabled = false;
        btn.innerHTML = `${icon('download')} Save PDF`;
        if (result === true) {
          toast(`Saved as ${name}.`, 'success');
          form.querySelector('[data-close]')?.click();
        } else if (result !== 'cancelled') {
          toast('Could not save here. Try the download link instead.', 'error');
        }
      });
    },
  });
}

/* ── shared document pieces ───────────────────────────────── */

export function signatureRow(doc, labels = ['Form teacher', 'Head of section', 'Principal']) {
  const width = doc.contentWidth;
  const gap = 14;
  const colW = (width - gap * (labels.length - 1)) / labels.length;
  doc.ensure(42);
  const y = doc.y - 26;
  labels.forEach((label, i) => {
    const x = doc.margin + i * (colW + gap);
    doc.line(x, y, x + colW, y, { color: [0.6, 0.64, 0.7], width: 0.7 });
    doc.text(label, x, y - 10, { size: 7.6, color: MUTED, width: colW, align: 'center' });
  });
  doc.y = y - 18;
  return doc;
}

export function documentHeader(doc, meta, title, subtitle) {
  doc.letterhead(meta, { title, subtitle });
  const term = meta.term ? `Term: ${meta.term}` : '';
  const printed = `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  doc.text(term, doc.margin, doc.y, { size: 8.4, color: MUTED });
  doc.text(printed, doc.margin, doc.y, { size: 8.4, color: MUTED, align: 'right', width: doc.contentWidth });
  doc.y -= 16;
  return doc;
}
