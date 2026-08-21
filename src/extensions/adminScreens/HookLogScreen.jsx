import { useState } from 'react'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Modal } from '../../core/controls/Modal.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { SelectInput, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Badge, PageHeader } from '../../core/controls/layout.jsx'
import { usePagedList } from '../../core/hooks/usePagedList.js'

const STATUS_FILTER = [
  { value: 'ok', label: 'ok' },
  { value: 'error', label: 'error' },
  { value: 'timeout', label: 'timeout' },
]

function statusTone(status) {
  if (status === 'ok') return 'ok'
  if (status === 'timeout') return 'warn'
  return 'danger'
}

/**
 * Hook Log (section 10.6): read-only.
 *
 * This is where acceptance scenario 4 is observed — a script with a syntax error appears
 * here as an error row while the Employee screen went on saving normally.
 */
export default function HookLogScreen() {
  const [status, setStatus] = useState('')
  const list = usePagedList('/admin/hook-log', { status: status || undefined })
  const [detail, setDetail] = useState(null)

  const columns = [
    { key: 'loggedOn', label: 'When', width: '180px', render: (r) => String(r.loggedOn).replace('T', ' ').slice(0, 19) },
    { key: 'hookKey', label: 'Hook point' },
    { key: 'runOn', label: 'Runs on', width: '100px' },
    {
      key: 'status',
      label: 'Status',
      width: '110px',
      render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    },
    { key: 'durationMs', label: 'ms', width: '80px' },
    {
      key: 'message',
      label: 'Message',
      render: (r) => (
        <span style={{ display: 'block', maxWidth: '520px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.message ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Hook log" subtitle="Every script run, successful or not" />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search hook key or message…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search the hook log"
          style={{ maxWidth: '320px' }}
        />
        <SelectInput
          options={STATUS_FILTER}
          placeholder="All statuses"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          style={{ maxWidth: '180px' }}
        />
        <Button size="sm" onClick={list.refresh}>
          Refresh
        </Button>
      </div>

      <DataTable
        caption="Hook log"
        columns={columns}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.logId}
        onRowClick={setDetail}
        emptyMessage="Nothing logged yet."
      />

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        totalCount={list.totalCount}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
      />

      {detail && (
        <Modal title={`${detail.hookKey ?? 'Hook'} — ${detail.status}`} onClose={() => setDetail(null)}>
          <h3>Message</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: 'var(--c-surface-alt)',
              padding: 'var(--s-3)',
              borderRadius: 'var(--r-md)',
            }}
          >
            {detail.message ?? '—'}
          </pre>

          <h3>Context</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: 'var(--c-surface-alt)',
              padding: 'var(--s-3)',
              borderRadius: 'var(--r-md)',
              maxHeight: '260px',
              overflow: 'auto',
            }}
          >
            {detail.contextJson ?? '—'}
          </pre>
        </Modal>
      )}
    </>
  )
}
