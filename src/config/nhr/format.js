/**
 * Formatting helpers for the nhr design system.
 *
 * Ported from the source module's utils/format.js. The country-pack layer went with it:
 * that module read an active currency pack supplied by its own config provider, and
 * Astitwa has no such concept. Money is formatted with the viewer's own locale and no
 * symbol, which is the honest default for a product that does not know its tenant's
 * currency — a tenant that needs one sets it in cfg_setting and passes its own formatter.
 */

const EMPTY = '—'

export const fmtNum = (n) => (n == null || Number.isNaN(Number(n)) ? EMPTY : Number(n).toLocaleString())

/** Money. No symbol: the renderer and the screens both take one from configuration. */
export const fmtMoney = (n, compact = false) => {
  if (n == null || Number.isNaN(Number(n))) return EMPTY
  const value = Number(n)

  if (compact) {
    const abs = Math.abs(value)
    if (abs >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`
    if (abs >= 1e5) return `${(value / 1e5).toFixed(2)}L`
    if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  }

  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Kept under its original name so ported pages need no edit. */
export const fmtINR = fmtMoney

export const fmtDate = (iso) => {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtDateShort = (iso) => {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

export const initials = (name = '') =>
  String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?'

/** Maps a status word onto one of the theme's status tones. */
export const statusTone = (status = '') => {
  const s = String(status).toLowerCase()
  if (['active', 'approved', 'issued', 'acknowledged', 'completed', 'paid', 'confirmed', 'success'].includes(s)) return 'success'
  if (['pending', 'pending signature', 'draft', 'in progress', 'processing', 'submitted'].includes(s)) return 'warning'
  if (['rejected', 'revoked', 'failed', 'cancelled', 'terminated', 'expired'].includes(s)) return 'danger'
  if (['review', 'on hold', 'probation', 'notice'].includes(s)) return 'pending'
  if (['info', 'open', 'new'].includes(s)) return 'info'
  return 'neutral'
}

export const priorityTone = (p = '') =>
  ({ critical: 'danger', high: 'warning', medium: 'info', low: 'neutral' })[String(p).toLowerCase()] || 'neutral'

/**
 * Downloads the rows on screen as CSV. Values are quoted and inner quotes doubled, so a
 * comma or a line break inside a cell cannot shift every following column.
 */
export const exportCSV = (rows, columns, filename = 'export.csv') => {
  const cols = columns.filter((c) => typeof c.header === 'string')
  const cell = (row, col) => {
    const value = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor ?? col.key]
    return value == null ? '' : String(value)
  }

  const quote = (s) => `"${String(s).replace(/"/g, '""')}"`
  const lines = [cols.map((c) => quote(c.header)).join(',')]
  for (const row of rows) lines.push(cols.map((c) => quote(cell(row, c))).join(','))

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
