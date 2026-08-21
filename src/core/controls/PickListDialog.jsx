import { useMemo, useState } from 'react'
import { Button } from './Button.jsx'
import { DataTable } from './DataTable.jsx'
import { Modal } from './Modal.jsx'
import { TextInput } from './inputs.jsx'

/**
 * The component behind ui.pickList() (section 10.4).
 *
 * A script supplies only data — { title, columns, rows, emptyAction }. Everything visible
 * here (layout, filtering, keyboard handling, focus trapping, ARIA) belongs to this component
 * and stays out of the script's reach.
 *
 * Resolves with the chosen row, or null when the user cancels.
 */
export function PickListDialog({ title = 'Select', columns = [], rows = [], emptyAction, onResolve }) {
  const [filter, setFilter] = useState('')

  const normalisedColumns = useMemo(
    () =>
      columns.map((c) =>
        typeof c === 'string' ? { key: c, label: c } : { key: c.key, label: c.label ?? c.key, width: c.width },
      ),
    [columns],
  )

  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      normalisedColumns.some((c) => String(row?.[c.key] ?? '').toLowerCase().includes(needle)),
    )
  }, [rows, filter, normalisedColumns])

  return (
    <Modal
      title={title}
      labelledBy="picklist-title"
      onClose={() => onResolve(null)}
      footer={
        <>
          {emptyAction?.label && (
            <Button
              onClick={() => onResolve({ __action: emptyAction.action ?? emptyAction.label })}
            >
              {emptyAction.label}
            </Button>
          )}
          <Button onClick={() => onResolve(null)}>Cancel</Button>
        </>
      }
    >
      <div className="toolbar">
        <TextInput
          placeholder="Filter…"
          value={filter}
          autoFocus
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter the list"
        />
        <span className="field__hint">
          {visibleRows.length} of {rows.length}
        </span>
      </div>

      <DataTable
        caption={title}
        columns={normalisedColumns}
        rows={visibleRows}
        rowKey={(row, i) => row?.id ?? row?.employeeId ?? i}
        onRowClick={(row) => onResolve(row)}
        emptyMessage="No matching rows."
      />
    </Modal>
  )
}
