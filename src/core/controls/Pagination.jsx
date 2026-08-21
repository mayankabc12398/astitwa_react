import { Button } from './Button.jsx'

/**
 * Every list endpoint is paged (section 11), so every list screen shows this.
 *
 * @param {{ page: number, pageSize: number, totalCount: number, totalPages: number,
 *           onPageChange: (page: number) => void, onPageSizeChange?: (size: number) => void }} props
 */
export function Pagination({ page, pageSize, totalCount, totalPages, onPageChange, onPageSizeChange }) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        {from}–{to} of {totalCount}
      </span>

      {onPageSizeChange && (
        <label>
          <span className="sr-only">Rows per page</span>
          <select
            className="select"
            style={{ width: 'auto', minHeight: '28px' }}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </label>
      )}

      <span className="pager__spacer" />

      <Button size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page} of {Math.max(totalPages, 1)}
      </span>
      <Button size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </Button>
    </nav>
  )
}
