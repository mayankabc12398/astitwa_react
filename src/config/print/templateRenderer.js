/**
 * Layer 2 — the print renderer.
 *
 * ONE function turns a template plus a data context into print-ready HTML, and that same
 * function feeds both the designer's live preview and the real print. If the preview and the
 * print ever used different code they would drift, and a designer whose preview lies is
 * worse than no designer at all — so everything that decides how a document looks lives here
 * and nowhere else.
 *
 * Pure: no React, no network, no clock. The printed-on stamp arrives through the context,
 * which is what keeps the preview deterministic.
 *
 * This lives in src/config/ rather than in a module because it is tenant configuration
 * rendered, the same category as DynamicField: Layer 1 screens consume it, and Layer 1 may
 * depend on Layer 2 but never the other way round.
 */

/* ------------------------------------------------------------------ escaping */

/**
 * Every interpolated value goes through this. Header, footer and rich-text markup are the
 * only things injected unescaped, and those are an administrator's own authored HTML — the
 * same trust level as a stored script.
 */
export const htmlEsc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m],
  )

/**
 * Colours and lengths are echoed into style attributes, so they are re-checked here even
 * though the API validates on save — the preview also renders templates nobody has saved yet.
 */
const safeColor = (value, fallback) =>
  typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : fallback

const safeFont = (value, fallback) =>
  typeof value === 'string' && /^[A-Za-z0-9 ,'-]{1,120}$/.test(value.trim()) ? value.trim() : fallback

const num = (value, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

/* ------------------------------------------------------------------ page */

const PAGE_MM = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [216, 279],
  Legal: [216, 356],
}

export const PAGE_SIZES = Object.keys(PAGE_MM)
export const ORIENTATIONS = ['portrait', 'landscape']
export const ALIGNS = ['left', 'center', 'right']
export const BORDER_STYLES = ['none', 'box', 'underline', 'grid']
export const FIELD_FORMATS = ['text', 'date', 'datetime', 'currency', 'number']

/** Must match the vocabulary PrintTemplateService accepts, or a saved block would not print. */
export const SECTION_TYPES = [
  'Header', 'Title', 'RefDate', 'Addressee', 'Subject', 'Paragraphs', 'FieldGrid',
  'Table', 'RichText', 'SignOff', 'Signature', 'Spacer', 'PageBreak', 'QrCode', 'Footer',
]

/**
 * Each preset reproduces a recognisable document look, so a tenant picks an outcome rather
 * than assembling one from a dozen type settings.
 *
 *   Ruled   the statutory form — Arial, hairline rules, ruled cells, centred letterhead.
 *   Letter  the appointment letter — accent rule under a split letterhead, justified body.
 *   Accent  the tabular report — tinted table head, zebra rows.
 */
export const STYLE_PRESETS = ['Ruled', 'Letter', 'Accent']

const PRESETS = {
  Ruled: {
    fontFamily: "Arial, 'Helvetica Neue', sans-serif",
    headAlign: 'center',
    headRule: (c) => `border-bottom:3px double ${c};`,
    ruleInk: '#222222',
    tableHeadBg: '#f2f2f2',
    tableHeadInk: '#111111',
    cellBorder: '1px solid #222222',
    zebra: '',
    gridRuled: true,
    justifyBody: false,
  },
  Letter: {
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    headAlign: 'split',
    headRule: (c) => `border-bottom:3px solid ${c};`,
    ruleInk: null, // follows the template's accent colour
    tableHeadBg: 'transparent',
    tableHeadInk: null,
    cellBorder: '1px solid #e5e7eb',
    zebra: '',
    gridRuled: false,
    justifyBody: true,
  },
  Accent: {
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    headAlign: 'split',
    headRule: (c) => `border-bottom:2px solid ${c};`,
    ruleInk: null,
    tableHeadBg: '#eef2ff',
    tableHeadInk: '#3730a3',
    cellBorder: '1px solid #eef2f7',
    zebra: '#f8fafc',
    gridRuled: false,
    justifyBody: false,
  },
}

const presetOf = (name) => PRESETS[name] || PRESETS.Letter

/** The rendered page box in mm, honouring orientation. */
export const pageDimensions = (template) => {
  const [w, h] = PAGE_MM[template?.pageSize] || PAGE_MM.A4
  return template?.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h }
}

/* ------------------------------------------------------------------ values */

/**
 * The renderer holds no locale and no currency symbol of its own. A caller that prints in
 * another currency passes its own formatters rather than editing this file.
 */
export const DEFAULT_FORMATTERS = {
  date: (v) => {
    const d = new Date(v)
    return Number.isNaN(d.getTime())
      ? String(v)
      : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  },
  datetime: (v) => {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
  },
  number: (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v)
  },
  currency: (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v)
  },
}

/** An empty value prints as an em dash so a ruled form keeps its shape. */
const EMPTY = '—'

const formatValue = (value, format, formatters) => {
  if (value === null || value === undefined || value === '') return EMPTY
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  const fns = { ...DEFAULT_FORMATTERS, ...(formatters || {}) }
  const fn = fns[format]
  return fn ? String(fn(value)) : String(value)
}

/**
 * Reads one key out of the context.
 *
 * Case-insensitive on purpose: a template written against 'EmployeeName' has to keep working
 * when the API answers with 'employeeName'. Dotted paths are supported so a caller can nest
 * without the designer needing to know it did.
 */
const lookup = (data, key) => {
  if (!data || !key) return undefined
  if (Object.prototype.hasOwnProperty.call(data, key)) return data[key]

  if (key.includes('.')) {
    return key.split('.').reduce((acc, part) => (acc == null ? acc : lookup(acc, part)), data)
  }

  const found = Object.keys(data).find((k) => k.toLowerCase() === key.toLowerCase())
  return found === undefined ? undefined : data[found]
}

/**
 * Field bindings a block carries, stored as {"bind":{slot:"fieldKey"}} inside its configJson.
 * Every block has built-in fallbacks, so a template that binds nothing still prints — a
 * binding only overrides which value feeds a given slot.
 */
export const bindingsOf = (section) => {
  const raw = section?.configJson
  if (!raw || typeof raw !== 'string' || !raw.trim().startsWith('{')) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.bind === 'object' && parsed.bind ? parsed.bind : {}
  } catch {
    return {}
  }
}

/** One slot's value: the bound key first, then the block's own fallbacks. */
const slot = (section, name, data, ...fallbacks) => {
  const bound = bindingsOf(section)[name]
  for (const key of bound ? [bound, ...fallbacks] : fallbacks) {
    const value = lookup(data, key)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

/**
 * Body copy authored into the block, accepting the shapes the designer stores:
 * {"paragraphs":[…]}, {"text":"…"} or raw text. A blank line separates paragraphs, which is
 * how the textarea behaves.
 */
export const templateBodyText = (section) => {
  const raw = section?.configJson
  if (!raw || typeof raw !== 'string' || !raw.trim()) return ''

  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return trimmed

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed?.paragraphs)) return parsed.paragraphs.filter(Boolean).join('\n\n')
    if (typeof parsed?.text === 'string') return parsed.text
    if (typeof parsed?.html === 'string') return parsed.html
    return ''
  } catch {
    // A half-typed JSON blob is still somebody's letter. Print it as prose rather than
    // dropping the block and leaving them staring at a gap.
    return trimmed
  }
}

const borderCss = (style, color) => {
  if (style === 'box') return `border:1px solid ${color};`
  if (style === 'underline') return `border-bottom:1px solid ${color};`
  return ''
}

/* ------------------------------------------------------------------ fallback */

/**
 * Used when the tenant has configured no template. Deliberately plain and deliberately auto
 * everywhere: installing this feature must not change a single printout until somebody edits
 * something.
 */
export const BUILTIN_TEMPLATE = {
  templateName: 'Built-in layout',
  documentType: '',
  stylePreset: 'Letter',
  pageSize: 'A4',
  orientation: 'portrait',
  marginTop: 14,
  marginRight: 14,
  marginBottom: 14,
  marginLeft: 14,
  fontFamily: 'Segoe UI',
  fontSizePt: 10.5,
  lineHeight: 1.45,
  accentColor: '#4f46e5',
  textColor: '#1f2937',
  showLogo: false,
  logoUrl: '',
  logoHeightMm: 14,
  logoAlign: 'left',
  headerAlign: '',
  showHeader: true,
  headerHtml: '',
  showFooter: true,
  footerHtml: '',
  showPageNumbers: true,
  showWatermark: false,
  watermarkText: '',
  sections: [
    { sectionType: 'Header', seqNo: 10, isVisible: true, fields: [] },
    { sectionType: 'Title', seqNo: 20, isVisible: true, fields: [] },
    { sectionType: 'RefDate', seqNo: 30, isVisible: true, fields: [] },
    { sectionType: 'Addressee', seqNo: 40, isVisible: true, fields: [] },
    { sectionType: 'Subject', seqNo: 50, isVisible: true, fields: [] },
    { sectionType: 'Paragraphs', seqNo: 60, isVisible: true, fields: [] },
    { sectionType: 'SignOff', seqNo: 70, isVisible: true, fields: [] },
    { sectionType: 'Footer', seqNo: 80, isVisible: true, fields: [] },
  ],
}

/* ------------------------------------------------------------------ css */

/** Everything the preview emits is a descendant of this, so nothing can reach the app shell. */
export const SCOPE_CLASS = '.tr-scope'

/**
 * Builds the document stylesheet. Two modes, and the difference is the whole reason this is
 * a function rather than a constant:
 *
 *   scoped = false  (print)    the markup owns its own iframe document, so the rules target
 *                              `body`, `*` and `@page` directly. Nothing else exists there.
 *
 *   scoped = true   (preview)  the markup is injected into the LIVE APP. A bare
 *                              `body { font-size }` would restyle the shell, `@page` would
 *                              hijack the app's own printing, and a fixed watermark would
 *                              cover the viewport. So every selector is prefixed, the page
 *                              at-rules are dropped, and the watermark is contained.
 *
 * Getting this wrong is not cosmetic: it would silently restyle the whole application the
 * moment somebody opens the designer.
 */
function buildCss(t, scoped) {
  const S = scoped ? `${SCOPE_CLASS} ` : ''
  const ROOT = scoped ? SCOPE_CLASS : 'body'
  const P = presetOf(t.stylePreset)
  const rule = P.ruleInk || t.accentColor
  const headInk = P.tableHeadInk || t.textColor

  const base = `
    ${scoped ? '' : `@page { size: ${t.pageSize} ${t.orientation}; margin: ${t.marginTop}mm ${t.marginRight}mm ${t.marginBottom}mm ${t.marginLeft}mm; }`}
    ${ROOT}, ${S}* { box-sizing: border-box; }
    ${ROOT} { ${scoped ? 'position:relative;' : 'margin:0;'} color:${t.textColor};
      font-family:${t.fontFamily}, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size:${t.fontSizePt}pt; line-height:${t.lineHeight};
      -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    ${S}.tr-doc { position:relative; }
    ${S}.tr-head { ${borderCss('underline', t.accentColor)} padding-bottom:6px; margin-bottom:10px; }
    ${S}.tr-logo img { max-width:100%; }
    ${S}.tr-a-left { text-align:left; } ${S}.tr-a-center { text-align:center; } ${S}.tr-a-right { text-align:right; }
    ${S}.tr-org { font-size:1.25em; font-weight:800; letter-spacing:-0.01em; }
    ${S}.tr-title-wrap { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin:8px 0 12px; }
    ${S}.tr-title { font-size:1.35em; font-weight:800; letter-spacing:.02em; text-transform:uppercase; }
    ${S}.tr-ref { font-size:.85em; opacity:.7; white-space:nowrap; }
    ${S}.tr-sec { margin:0 0 12px; break-inside:avoid; }
    ${S}.tr-sec-title { font-weight:700; font-size:.95em; margin-bottom:5px; padding-bottom:3px; ${borderCss('underline', t.accentColor)} }
    ${S}.tr-grid { display:flex; flex-wrap:wrap; gap:6px 0; }
    ${S}.tr-cell { padding:3px 8px 3px 0; break-inside:avoid; }
    ${S}.tr-lbl { font-size:.75em; text-transform:uppercase; letter-spacing:.04em; opacity:.6; }
    ${S}.tr-val { font-size:1em; }
    ${S}.tr-b { font-weight:700; }
    ${S}.tr-table { width:100%; border-collapse:collapse; font-size:.92em; }
    ${S}.tr-table thead { display:table-header-group; }
    ${S}.tr-table th { text-align:left; font-weight:700; padding:6px 8px; }
    ${S}.tr-table td { padding:5px 8px; }
    ${S}.tr-table tr { break-inside:avoid; }
    ${S}.tr-table.tr-ruled th, ${S}.tr-table.tr-ruled td { border:1px solid var(--tr-rule); }
    ${S}.tr-signs { display:flex; gap:24px; margin-top:22px; }
    ${S}.tr-sign { flex:1; }
    ${S}.tr-sign-rule { border-top:1px solid ${t.textColor}; margin-bottom:4px; }
    ${S}.tr-sign-lbl { font-size:.8em; opacity:.7; }
    ${S}.tr-rich { font-size:1em; }
    ${S}.tr-qr { font-family:Consolas,'Courier New',monospace; font-size:.8em; opacity:.7; }
    ${S}.tr-foot { margin-top:14px; padding-top:6px; ${borderCss('underline', t.accentColor)} font-size:.78em; opacity:.7; }
    ${S}.tr-foot-auto { margin-top:2px; }
    ${S}.tr-break { break-after:page; page-break-after:always; height:0; }
    ${S}.tr-watermark { position:${scoped ? 'absolute' : 'fixed'}; inset:0; display:flex; align-items:center;
      justify-content:center; font-size:72pt; font-weight:800; color:${t.accentColor}; opacity:.12;
      transform:rotate(-30deg); pointer-events:none; z-index:0; }
    ${S}.tr-doc > * { position:relative; z-index:1; }
  `

  // Preset rules come after the base on purpose: same specificity, so the later declaration
  // wins and the preset is what actually decides the look. First would let base override it.
  const preset = `
    ${S}.tr-head { ${P.headRule(rule)} }
    ${S}.tr-head-split { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
    ${S}.tr-addr { font-size:.8em; opacity:.7; line-height:1.6; max-width:62mm; text-align:${P.headAlign === 'split' ? 'right' : 'center'}; }
    ${S}.tr-headhtml { text-align:${P.headAlign === 'center' ? 'center' : 'left'}; }
    ${S}.tr-refdate { display:flex; justify-content:space-between; gap:12px; font-size:.82em; opacity:.75; margin:0 0 12px; }
    ${S}.tr-mono { font-family:Consolas,'Courier New',monospace; }
    ${S}.tr-addressee { font-size:.95em; line-height:1.7; margin:0 0 14px; }
    ${S}.tr-subject { font-weight:800; font-size:.95em; text-decoration:underline; text-underline-offset:3px; margin:0 0 14px; }
    ${S}.tr-body p { margin:0 0 10px; line-height:1.75; ${P.justifyBody ? 'text-align:justify;' : ''} }
    ${S}.tr-greet { margin:0 0 10px; }
    ${S}.tr-signoff { margin-top:18px; line-height:1.7; font-size:.95em; }
    ${S}.tr-sig-name { font-weight:700; margin-top:22px; }
    ${S}.tr-sig-role { font-size:.82em; opacity:.7; }
    ${S}.tr-table th { background:${P.tableHeadBg}; color:${headInk}; border-bottom:2px solid ${rule}; }
    ${S}.tr-table td { border-bottom:${P.cellBorder}; }
    ${P.zebra ? `${S}.tr-table tbody tr:nth-child(even) { background:${P.zebra}; }` : ''}
    ${P.gridRuled
      ? `
      ${S}.tr-table th, ${S}.tr-table td { border:${P.cellBorder}; }
      ${S}.tr-grid { gap:0; }
      ${S}.tr-cell { border:${P.cellBorder}; padding:4px 8px; }
      ${S}.tr-cell .tr-lbl { font-size:.72em; }
      ${S}.tr-title-wrap { display:block; text-align:center; }
      ${S}.tr-ref { display:block; margin-top:3px; }
    `
      : ''}
  `

  // Header alignment is the administrator's explicit choice, so it is emitted last and beats
  // the preset. The logo is placed with margins rather than text-align because a block image
  // ignores its parent's alignment — which is what made the preview and the print disagree.
  const logoAlign = ALIGNS.includes(t.logoAlign) ? t.logoAlign : 'left'
  const align = ALIGNS.includes(t.headerAlign) ? t.headerAlign : logoAlign
  const logoMargin = { left: '0 auto 0 0', center: '0 auto', right: '0 0 0 auto' }[logoAlign]

  const alignment = `
    ${S}.tr-logo.tr-a-${logoAlign} { text-align:${logoAlign}; }
    ${S}.tr-logo.tr-a-${logoAlign} img { display:block; margin:${logoMargin}; }
    ${S}.tr-head.tr-a-${align} .tr-headhtml { text-align:${align}; }
    ${S}.tr-head.tr-a-center .tr-head-split { justify-content:center; }
    ${S}.tr-head.tr-a-right .tr-head-split { justify-content:flex-end; }
    ${S}.tr-head.tr-a-center .tr-addr, ${S}.tr-head.tr-a-right .tr-addr { max-width:none; text-align:inherit; }
  `

  return base + preset + alignment
}

/* ------------------------------------------------------------------ blocks */

const renderHeader = (t, data, ctx, section) => {
  const parts = []

  if (t.showLogo && t.logoUrl) {
    parts.push(
      `<div class="tr-logo tr-a-${t.logoAlign}"><img src="${htmlEsc(t.logoUrl)}" alt="" style="height:${num(t.logoHeightMm, 14, 0, 60)}mm"></div>`,
    )
  }

  const custom = t.showHeader && t.headerHtml ? t.headerHtml : ''
  if (custom) {
    // An administrator's own letterhead markup, the same trust level as a stored script.
    parts.push(`<div class="tr-headhtml">${custom}</div>`)
  } else if (t.showHeader) {
    const org = slot(section, 'organisation', data, 'tenantName') || ctx.organisation || ''
    const address = slot(section, 'address', data, 'organisationAddress') || ctx.address || ''

    if (org || address) {
      const block = `<div><div class="tr-org">${htmlEsc(org)}</div></div>`
      parts.push(
        presetOf(t.stylePreset).headAlign === 'split' && address
          ? `<div class="tr-headhtml tr-head-split">${block}<div class="tr-addr">${htmlEsc(address)}</div></div>`
          : `<div class="tr-headhtml">${block}${address ? `<div class="tr-addr">${htmlEsc(address)}</div>` : ''}</div>`,
      )
    }
  }

  const logoAlign = ALIGNS.includes(t.logoAlign) ? t.logoAlign : 'left'
  const align = ALIGNS.includes(t.headerAlign) ? t.headerAlign : logoAlign
  return parts.length ? `<div class="tr-head tr-a-${align}">${parts.join('')}</div>` : ''
}

const renderTitle = (t, data, ctx, section) => {
  const title =
    slot(section, 'title', data) || ctx.title || lookup(data, 'documentTitle') || t.documentTitle || ''
  const ref = slot(section, 'ref', data, 'refNo')
  if (!title && !ref) return ''

  return (
    `<div class="tr-title-wrap">` +
    (title ? `<div class="tr-title">${htmlEsc(title)}</div>` : '') +
    (ref ? `<div class="tr-ref">${htmlEsc(ref)}</div>` : '') +
    `</div>`
  )
}

const renderRefDate = (section, data, opts) => {
  const ref = slot(section, 'ref', data, 'refNo')
  const raw = slot(section, 'date', data, 'issuedOn', 'effectiveDate')
  const date = raw ? formatValue(raw, 'date', opts.formatters) : ''
  if (!ref && !date) return ''

  return (
    `<div class="tr-refdate">` +
    `<span class="tr-mono">${ref ? `Ref: ${htmlEsc(ref)}` : ''}</span>` +
    `<span>${date && date !== EMPTY ? `Date: ${htmlEsc(date)}` : ''}</span>` +
    `</div>`
  )
}

const renderAddressee = (section, data, ctx) => {
  const name = slot(section, 'name', data, 'employeeName', 'fullName')
  if (!name) return ''

  const line2 = [
    slot(section, 'designation', data, 'designationName'),
    slot(section, 'department', data, 'departmentName'),
  ]
    .filter(Boolean)
    .join(', ')

  const org = slot(section, 'organisation', data, 'tenantName') || ctx.organisation || ''

  return (
    `<div class="tr-addressee">To,<br><b>${htmlEsc(name)}</b>` +
    (line2 ? `<br>${htmlEsc(line2)}` : '') +
    (org ? `<br>${htmlEsc(org)}` : '') +
    `</div>`
  )
}

const renderSubject = (section, data, ctx) => {
  const subject = slot(section, 'subject', data, 'subject') || ctx.title || ''
  return subject ? `<div class="tr-subject">Subject: ${htmlEsc(subject)}</div>` : ''
}

/** A supplied opening line that is already a salutation. */
const OWN_GREETING = /^\s*(dear\b|to\s+whom\s+it\s+may\s+concern|respected\b|sir\b|madam\b|to\s*,)/i

/** `{{employeeName}}` → the value from the context. Unknown or empty tokens vanish. */
const fillTokens = (text, data, opts) =>
  String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const value = lookup(data, key)
    if (value === null || value === undefined || value === '') return ''
    const out = formatValue(value, 'text', opts?.formatters)
    return out === EMPTY ? '' : out
  })

const renderParagraphs = (data, section, opts) => {
  // The template's own wording wins: it is the thing an administrator can edit, so copy
  // authored into the block must not be overridden by whatever the screen composed.
  const authored = templateBodyText(section)
  if (authored) {
    const paras = fillTokens(authored, data, opts)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)

    if (paras.length) {
      // No automatic greeting here — the author writes their own opening line, otherwise
      // "Dear Priya," would appear twice.
      return `<div class="tr-body">${paras.map((p) => `<p>${htmlEsc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
    }
  }

  // Copy typed on the document itself. Tokens are filled here too: whoever writes the
  // letter should not have to know whether the wording lives on the document or on the
  // template, and a raw {{employeeName}} reaching a printed page is never what was meant.
  const supplied = fillTokens(lookup(data, 'bodyText') ?? '', data, opts)
  const paras = String(supplied)
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (!paras.length) return ''

  const first = String(lookup(data, 'employeeName') ?? '').split(' ')[0]
  const opensItself = OWN_GREETING.test(paras[0] || '')

  return (
    `<div class="tr-body">` +
    (first && !opensItself ? `<p class="tr-greet">Dear ${htmlEsc(first)},</p>` : '') +
    paras.map((p) => `<p>${htmlEsc(p)}</p>`).join('') +
    `</div>`
  )
}

const renderSignOff = (section, data, ctx) => {
  const signedBy = slot(section, 'signedBy', data, 'signedBy')
  const org = slot(section, 'organisation', data, 'tenantName') || ctx.organisation || ''
  if (!signedBy && !org) return ''

  // "Name (Role)" is how a signatory is stored, so it is split rather than printed raw.
  const match = String(signedBy).match(/^(.*?)\s*\((.*)\)$/)
  const name = match ? match[1].trim() : String(signedBy).trim()
  const role = match ? match[2].trim() : 'Human Resources'

  return (
    `<div class="tr-signoff">` +
    `<div>Yours sincerely,</div>` +
    (org ? `<div>For <b>${htmlEsc(org)}</b></div>` : '') +
    (name ? `<div class="tr-sig-name">${htmlEsc(name)}</div><div class="tr-sig-role">${htmlEsc(role)}</div>` : '') +
    `</div>`
  )
}

/**
 * A FieldGrid with no configured fields is in AUTO mode and prints every printable value in
 * the context. That is what makes this feature a no-op on install; once an administrator
 * curates the list, only the curated fields print.
 */
const renderFieldGrid = (section, data, opts) => {
  const cols = num(section.columnCount, 2, 1, 4)
  const ruled = section.borderStyle === 'grid'
  const rule = safeColor(section.borderColor, opts.accentColor || '#d0d5dd')
  const fill = section.backgroundColor ? safeColor(section.backgroundColor, '') : ''
  const pad = num(section.paddingMm, 0, 0, 40)

  let fields = section.fields || []

  if (!fields.length) {
    fields = Object.keys(data || {})
      .filter((k) => !k.startsWith('_'))
      // Surrogate keys and audit plumbing are never worth printing. Auto mode is a fallback,
      // not a dump — somebody who wants an id adds it deliberately.
      .filter((k) => !/(^|[a-z])(Id|Key|Json)$/.test(k))
      .filter((k) => {
        const v = data[k]
        return v === null || ['string', 'number', 'boolean'].includes(typeof v)
      })
      .map((k) => ({
        fieldKey: k,
        label: humanise(k),
        showLabel: true,
        widthPercent: Math.floor(100 / cols),
        format: 'text',
        align: 'left',
      }))
  }

  if (!fields.length) return ''

  const cells = fields
    .map((f) => {
      const isStatic = f.fieldKey === '@static'
      const value = isStatic ? f.staticText || '' : formatValue(lookup(data, f.fieldKey), f.format, opts.formatters)
      const label = f.showLabel === false ? '' : `<div class="tr-lbl">${htmlEsc(f.label || humanise(f.fieldKey))}</div>`
      const body = `<div class="tr-val${f.isBold ? ' tr-b' : ''}">${htmlEsc(value)}</div>`
      const width = num(f.widthPercent, Math.floor(100 / cols), 5, 100)
      const style = ruled
        ? `width:${width}%;border-right:1px solid ${rule};border-bottom:1px solid ${rule};padding:5px 8px;`
        : `width:${width}%`

      return `<div class="tr-cell tr-a-${f.align || 'left'}" style="${style}">${label}${body}</div>`
    })
    .join('')

  const heading = section.title ? `<div class="tr-sec-title">${htmlEsc(section.title)}</div>` : ''

  // The wrapper carries the two outer lines a per-cell border cannot draw, plus the fill, so
  // adjacent cells never double up on the edge they share.
  const gridStyle = [
    ruled ? `border-top:1px solid ${rule};border-left:1px solid ${rule};gap:0;` : '',
    section.borderStyle === 'box' && !ruled ? `${borderCss('box', rule)}padding:6px 8px;` : '',
    section.borderStyle === 'underline' ? borderCss('underline', rule) : '',
    fill ? `background:${fill};` : '',
    pad ? `padding:${pad}mm;` : '',
  ].join('')

  return `<div class="tr-sec">${heading}<div class="tr-grid"${gridStyle ? ` style="${gridStyle}"` : ''}>${cells}</div></div>`
}

/**
 * Line items. Rows come from the context under `rows`; columns are the block's fields, or
 * every key of the first row when the block is in auto mode. No rows renders nothing rather
 * than an empty frame.
 */
const renderTable = (section, data, opts) => {
  const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(opts.rows) ? opts.rows : []
  if (!rows.length) return ''

  let cols = section.fields || []
  if (!cols.length) {
    cols = Object.keys(rows[0] || {}).map((k) => ({ fieldKey: k, label: humanise(k), format: 'text', align: 'left' }))
  }
  if (!cols.length) return ''

  const head = cols
    .map((c) => `<th class="tr-a-${c.align || 'left'}">${htmlEsc(c.label || humanise(c.fieldKey))}</th>`)
    .join('')

  const body = rows
    .map(
      (r) =>
        `<tr>${cols
          .map(
            (c) =>
              `<td class="tr-a-${c.align || 'left'}${c.isBold ? ' tr-b' : ''}">${htmlEsc(
                formatValue(lookup(r, c.fieldKey), c.format, opts.formatters),
              )}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')

  const heading = section.title ? `<div class="tr-sec-title">${htmlEsc(section.title)}</div>` : ''
  const rule = section.borderColor ? safeColor(section.borderColor, '') : ''
  const fill = section.backgroundColor ? safeColor(section.backgroundColor, '') : ''
  const style = [rule ? `--tr-rule:${rule};border-color:${rule};` : '', fill ? `background:${fill};` : ''].join('')

  return (
    `<div class="tr-sec">${heading}` +
    `<table class="tr-table${rule ? ' tr-ruled' : ''}"${style ? ` style="${style}"` : ''}>` +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
  )
}

/**
 * Signing slots. configJson may carry {"slots":["Prepared by","Approved by"]}; a malformed
 * blob falls back to the block's fields and then to two blanks — a typo must not silently
 * remove the signature area from a letter.
 */
const renderSignature = (section) => {
  let slots = []

  if (section.configJson) {
    try {
      const parsed = JSON.parse(section.configJson)
      if (Array.isArray(parsed?.slots)) slots = parsed.slots.filter((s) => typeof s === 'string')
    } catch {
      /* fall through to the field list */
    }
  }

  if (!slots.length && section.fields?.length) slots = section.fields.map((f) => f.label || f.fieldKey)
  if (!slots.length) slots = ['Prepared by', 'Authorised by']

  const cells = slots
    .map((s) => `<div class="tr-sign"><div class="tr-sign-rule"></div><div class="tr-sign-lbl">${htmlEsc(s)}</div></div>`)
    .join('')

  return `<div class="tr-sec tr-signs">${cells}</div>`
}

const renderRichText = (section) => {
  if (!section.configJson) return ''

  let body = section.configJson
  try {
    const parsed = JSON.parse(section.configJson)
    if (typeof parsed?.html === 'string') body = parsed.html
    else if (typeof parsed?.text === 'string') body = htmlEsc(parsed.text)
  } catch {
    /* not JSON — the whole blob is the body */
  }

  return `<div class="tr-sec tr-rich">${body}</div>`
}

const renderFooter = (t, data, ctx) => {
  const custom = t.showFooter && t.footerHtml ? t.footerHtml : ''
  const printedOn = lookup(data, 'printedOn') ?? ctx.printedOn ?? ''
  const printedBy = lookup(data, 'printedBy') ?? ctx.printedBy ?? ''

  const auto =
    printedOn || printedBy
      ? `<div class="tr-foot-auto">${htmlEsc(
          [printedOn ? `Printed ${printedOn}` : '', printedBy ? `by ${printedBy}` : ''].filter(Boolean).join(' '),
        )}</div>`
      : ''

  if (!custom && !auto) return ''
  return `<div class="tr-foot">${custom || ''}${auto}</div>`
}

/** 'employeeCode' → 'Employee code'. Only ever a fallback for an unlabelled key. */
const humanise = (key) =>
  String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())

/* ------------------------------------------------------------------ render */

/**
 * Turns a template plus a data context into HTML.
 *
 * @param {object} template designer shape (camelCase) carrying a `sections` array
 * @param {object} data     flat key/value context; `rows` carries line items
 * @param {object} options  { title, organisation, address, printedOn, printedBy, rows,
 *                            formatters, standalone }
 * @returns {string} a complete document when `standalone` is not false, otherwise the body
 *                   markup the live preview injects.
 */
export function renderTemplate(template, data = {}, options = {}) {
  const src = template && typeof template === 'object' ? template : BUILTIN_TEMPLATE

  const ctx = {
    title: options.title || '',
    organisation: options.organisation || '',
    address: options.address || '',
    printedOn: options.printedOn || '',
    printedBy: options.printedBy || '',
  }

  // Everything that reaches a style attribute is clamped here, once, so no block below has
  // to re-check whether a colour is a colour.
  const t = {
    ...src,
    pageSize: PAGE_MM[src.pageSize] ? src.pageSize : 'A4',
    orientation: ORIENTATIONS.includes(src.orientation) ? src.orientation : 'portrait',
    marginTop: num(src.marginTop, 14, 0, 60),
    marginRight: num(src.marginRight, 14, 0, 60),
    marginBottom: num(src.marginBottom, 14, 0, 60),
    marginLeft: num(src.marginLeft, 14, 0, 60),
    fontFamily: safeFont(src.fontFamily, 'Segoe UI'),
    fontSizePt: num(src.fontSizePt, 10.5, 6, 24),
    lineHeight: num(src.lineHeight, 1.45, 1, 3),
    accentColor: safeColor(src.accentColor, '#4f46e5'),
    textColor: safeColor(src.textColor, '#1f2937'),
    logoAlign: ALIGNS.includes(src.logoAlign) ? src.logoAlign : 'left',
    headerAlign: ALIGNS.includes(src.headerAlign) ? src.headerAlign : '',
    stylePreset: STYLE_PRESETS.includes(src.stylePreset) ? src.stylePreset : 'Letter',
  }

  // A preset owns the typeface unless the template names one, which is what makes "the same
  // look as the old document" reproducible without anyone retyping font names.
  if (!src.fontFamily) t.fontFamily = presetOf(t.stylePreset).fontFamily

  const opts = { ...options, accentColor: t.accentColor }

  const sections = (t.sections || [])
    .filter((s) => s && s.isVisible !== false && SECTION_TYPES.includes(s.sectionType))
    .slice()
    .sort((a, b) => num(a.seqNo, 0) - num(b.seqNo, 0))

  const blocks = sections
    .map((section) => {
      switch (section.sectionType) {
        case 'Header':
          return renderHeader(t, data, ctx, section)
        case 'Title':
          return renderTitle(t, data, ctx, section)
        case 'RefDate':
          return renderRefDate(section, data, opts)
        case 'Addressee':
          return renderAddressee(section, data, ctx)
        case 'Subject':
          return renderSubject(section, data, ctx)
        case 'Paragraphs':
          return renderParagraphs(data, section, opts)
        case 'FieldGrid':
          return renderFieldGrid(section, data, opts)
        case 'Table':
          return renderTable(section, data, opts)
        case 'RichText':
          return renderRichText(section)
        case 'SignOff':
          return renderSignOff(section, data, ctx)
        case 'Signature':
          return renderSignature(section)
        case 'Spacer':
          return `<div style="height:${num(section.paddingMm, 6, 0, 60)}mm"></div>`
        case 'PageBreak':
          return `<div class="tr-break"></div>`
        case 'QrCode':
          return lookup(data, 'refNo') ? `<div class="tr-sec tr-qr">${htmlEsc(lookup(data, 'refNo'))}</div>` : ''
        case 'Footer':
          return renderFooter(t, data, ctx)
        default:
          return ''
      }
    })
    .join('')

  const watermark =
    t.showWatermark && t.watermarkText ? `<div class="tr-watermark">${htmlEsc(t.watermarkText)}</div>` : ''

  const body = `<div class="tr-doc">${watermark}${blocks}</div>`
  const standalone = options.standalone !== false
  const css = buildCss(t, !standalone)

  if (!standalone) return body

  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEsc(ctx.title || t.templateName || 'Document')}</title>` +
    `<style>${css}</style></head><body>${body}</body></html>`
  )
}

/**
 * Preview markup for the designer: the same render, wrapped in a fixed page box, so what is
 * on screen is literally the printed page at scale.
 */
export function renderPreview(template, data = {}, options = {}) {
  const t = template || BUILTIN_TEMPLATE
  const dim = pageDimensions(t)
  const inner = renderTemplate(t, data, { ...options, standalone: false })
  const pad = `${num(t.marginTop, 14, 0, 60)}mm ${num(t.marginRight, 14, 0, 60)}mm ${num(t.marginBottom, 14, 0, 60)}mm ${num(t.marginLeft, 14, 0, 60)}mm`

  return `<div style="width:${dim.width}mm;min-height:${dim.height}mm;padding:${pad};background:#fff;color:#1f2937;">${inner}</div>`
}

/** The stylesheet the preview needs. Kept separate so a caller injects it once, not per keystroke. */
export function previewCss(template) {
  const t = template || BUILTIN_TEMPLATE
  return buildCss(
    {
      ...t,
      pageSize: PAGE_MM[t.pageSize] ? t.pageSize : 'A4',
      orientation: ORIENTATIONS.includes(t.orientation) ? t.orientation : 'portrait',
      fontFamily: safeFont(t.fontFamily, 'Segoe UI') || presetOf(t.stylePreset).fontFamily,
      fontSizePt: num(t.fontSizePt, 10.5, 6, 24),
      lineHeight: num(t.lineHeight, 1.45, 1, 3),
      accentColor: safeColor(t.accentColor, '#4f46e5'),
      textColor: safeColor(t.textColor, '#1f2937'),
      logoAlign: ALIGNS.includes(t.logoAlign) ? t.logoAlign : 'left',
      headerAlign: ALIGNS.includes(t.headerAlign) ? t.headerAlign : '',
      stylePreset: STYLE_PRESETS.includes(t.stylePreset) ? t.stylePreset : 'Letter',
      marginTop: num(t.marginTop, 14, 0, 60),
      marginRight: num(t.marginRight, 14, 0, 60),
      marginBottom: num(t.marginBottom, 14, 0, 60),
      marginLeft: num(t.marginLeft, 14, 0, 60),
    },
    true,
  )
}
