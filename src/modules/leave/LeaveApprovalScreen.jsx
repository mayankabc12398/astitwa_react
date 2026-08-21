import { useState } from 'react'
import { api } from '../../core/api/client.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Badge, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { usePagedList } from '../../core/hooks/usePagedList.js'
import { statusTone } from './leaveShared.jsx'

/**
 * The approval queue.
 *
 * Two Layer 1 rules are enforced by the server and surfaced here: an employee cannot decide
 * their own request, and a request that has already been decided cannot be decided again.
 *
 * Approval succeeds whether or not an email integration is configured — the notification is
 * dispatched behind INotificationChannel and a missing adapter is a no-op (scenario 7).
 */
export default function LeaveApprovalScreen() {
  const ui = useUi()
  const list = usePagedList('/hr/leave/pending')
  const [deciding, setDeciding] = useState(0)
  const [error, setError] = useState('')

  async function decide(row, approve) {
    const verb = approve ? 'Approve' : 'Reject'
    const confirmed = await ui.confirm({
      title: `${verb} leave`,
      message: `${verb} ${row.employeeName}'s leave from ${String(row.fromDate).slice(0, 10)} to ${String(
        row.toDate,
      ).slice(0, 10)}?`,
      confirmLabel: verb,
      danger: !approve,
    })
    if (!confirmed) return

    const remark = approve ? 'Approved.' : 'Rejected.'

    setDeciding(row.leaveRequestId)
    setError('')
    try {
      await api.post('/hr/leave/decision', {
        leaveRequestId: row.leaveRequestId,
        approve,
        remark,
      })
      ui.toast(`Leave ${approve ? 'approved' : 'rejected'}.`)
      list.refresh()
    } catch (cause) {
      setError(cause?.message ?? 'The decision could not be recorded.')
    } finally {
      setDeciding(0)
    }
  }

  const columns = [
    { key: 'employeeCode', label: 'Code', width: '120px' },
    { key: 'employeeName', label: 'Employee' },
    { key: 'leaveTypeName', label: 'Type', width: '150px' },
    { key: 'fromDate', label: 'From', width: '120px', render: (r) => String(r.fromDate).slice(0, 10) },
    { key: 'toDate', label: 'To', width: '120px', render: (r) => String(r.toDate).slice(0, 10) },
    { key: 'days', label: 'Days', width: '70px' },
    { key: 'reason', label: 'Reason' },
    {
      key: 'status',
      label: 'Status',
      width: '110px',
      render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'actions',
      label: 'Decision',
      width: '200px',
      render: (row) => (
        <span style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <Button
            size="sm"
            variant="primary"
            busy={deciding === row.leaveRequestId}
            onClick={(e) => {
              e.stopPropagation()
              decide(row, true)
            }}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="danger"
            busy={deciding === row.leaveRequestId}
            onClick={(e) => {
              e.stopPropagation()
              decide(row, false)
            }}
          >
            Reject
          </Button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Leave approvals" subtitle="Pending requests" />

      {error && <Alert tone="error">{error}</Alert>}
      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search employee or reason…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search pending requests"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <DataTable
        caption="Pending leave requests"
        columns={columns}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.leaveRequestId}
        emptyMessage="Nothing is waiting for a decision."
      />

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        totalCount={list.totalCount}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
      />
    </>
  )
}
