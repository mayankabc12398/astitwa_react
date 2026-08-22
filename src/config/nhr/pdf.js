/**
 * Table printing for the nhr DataTable.
 *
 * Ported from the source module's utils/pdf.js. Its downloadAreaPdf() came with it but is
 * not here: that path screenshots the layout through html2pdf, which is a dependency this
 * product does not carry and produces raster text nobody can select. Printing goes through
 * the browser dialogue instead, and "Save as PDF" there yields the file.
 */


// Filesystem-safe filename fragment (letter ref nos etc. carry slashes).
export const pdfSafe = (s) => String(s || 'document').replace(/[\\/:*?"<>|]+/g, '-');

const htmlEsc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

const cellText = (row, col) => {
  const v = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor ?? col.key];
  return v == null || v === '' ? '—' : v;
};

/**
 * Print ONLY the table content as a clean, attractive document. Builds a fresh
 * styled table (all given rows, plain cell values) in an off-screen iframe and
 * triggers the browser's native print — vector-crisp, headers repeat on every
 * page, page breaks land on row boundaries, and none of the app chrome / web
 * components are involved. Save-as-PDF in the print dialog yields the PDF.
 */
export function printTable({ columns = [], rows = [], title = 'Report', subtitle = '', accent = '#c4b5fd', headBg = '#ede9fe', headInk = '#4c1d95' } = {}) {
  const cols = columns.filter((c) => typeof c.header === 'string');
  const head = cols
    .map((c) => `<th style="text-align:${c.align === 'right' || c.align === 'center' ? c.align : 'left'}">${htmlEsc(c.header)}</th>`)
    .join('');
  const body = rows
    .map(
      (r) => `<tr>${cols
        .map((c) => `<td style="text-align:${c.align === 'right' || c.align === 'center' ? c.align : 'left'}">${htmlEsc(cellText(r, c))}</td>`)
        .join('')}</tr>`
    )
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEsc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 2px solid ${accent}; padding-bottom: 10px; margin-bottom: 14px; }
  .doc-title { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }
  .doc-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
  .doc-meta { font-size: 11px; color: #6b7280; text-align: right; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { display: table-header-group; }
  thead th { background: ${headBg}; color: ${headInk}; font-weight: 700; padding: 8px 10px; border-bottom: 2px solid ${accent}; }
  tbody td { padding: 6px 10px; border-bottom: 1px solid #eef2f7; }
  tbody tr { break-inside: avoid; }
  tbody tr:nth-child(even) { background: #faf9ff; }
  .doc-foot { margin-top: 12px; font-size: 10px; color: #9ca3af; text-align: right; }
</style></head>
<body>
  <div class="doc-head">
    <div><div class="doc-title">${htmlEsc(title)}</div>${subtitle ? `<div class="doc-sub">${htmlEsc(subtitle)}</div>` : ''}</div>
    <div class="doc-meta">${rows.length} record${rows.length === 1 ? '' : 's'}</div>
  </div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <div class="doc-foot">Generated ${new Date().toLocaleString()}</div>
</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(html);
  idoc.close();
  const fire = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 1000);
    }
  };
  if (idoc.readyState === 'complete') setTimeout(fire, 60);
  else iframe.onload = () => setTimeout(fire, 60);
}
