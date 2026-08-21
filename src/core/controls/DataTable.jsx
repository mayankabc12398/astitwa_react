/**
 * A plain paged table. Every list screen and ui.pickList() render through this, so the
 * markup, the empty state and the keyboard behaviour are written once.
 *
 * @param {{
 *   columns: Array<{key: string, label: string, render?: (row: any) => any, width?: string}>,
 *   rows: Array<any>,
 *   rowKey?: (row: any, index: number) => string|number,
 *   onRowClick?: (row: any) => void,
 *   emptyMessage?: string,
 *   busy?: boolean,
 *   caption?: string
 * }} props
 */
export function DataTable({
  columns,
  rows,
  rowKey = (_row, index) => index,
  onRowClick,
  emptyMessage = 'Nothing to show.',
  busy = false,
  caption,
}) {
  const selectable = typeof onRowClick === 'function'

  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="table__empty" colSpan={columns.length}>
                {busy ? 'Loading…' : emptyMessage}
              </td>
            </tr>
          )}

          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className={selectable ? 'table__row--selectable' : undefined}
              tabIndex={selectable ? 0 : undefined}
              role={selectable ? 'button' : undefined}
              onClick={selectable ? () => onRowClick(row) : undefined}
              onKeyDown={
                selectable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
