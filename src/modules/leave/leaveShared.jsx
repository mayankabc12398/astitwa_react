export function statusTone(status) {
  switch (status) {
    case 'Approved':
      return 'ok'
    case 'Rejected':
      return 'danger'
    case 'Pending':
      return 'warn'
    default:
      return 'muted'
  }
}

/** Inclusive day span, mirroring DateHelper.InclusiveDays on the server. */
export function inclusiveDays(fromDate, toDate) {
  if (!fromDate || !toDate) return 0
  const from = new Date(fromDate)
  const to = new Date(toDate)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  if (to < from) return 0
  return Math.round((to - from) / 86400000) + 1
}
