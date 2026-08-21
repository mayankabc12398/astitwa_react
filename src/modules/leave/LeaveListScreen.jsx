import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { SelectInput, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, PageHeader } from '../../core/controls/layout.jsx'
import { usePagedList } from '../../core/hooks/usePagedList.js'
import { statusTone } from './leaveShared.jsx'
import { Badge } from '../../core/controls/layout.jsx'
import { useState } from 'react'

const STATUS_FILTER = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
]

const COLUMNS = [
  { key: 'employeeCode', label: 'Code', width: '120px' },
  { key: 'employeeName', label: 'Employee' },
  { key: 'leaveTypeName', label: 'Type', width: '160px' },
  { key: 'fromDate', label: 'From', width: '120px', render: (r) => String(r.fromDate).slice(0, 10) },
  { key: 'toDate', label: 'To', width: '120px', render: (r) => String(r.toDate).slice(0, 10) },
  { key: 'days', label: 'Days', width: '80px' },
  {
    key: 'status',
    label: 'Status',
    width: '120px',
    render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
  },
]

export default function LeaveListScreen() {
  const navigate = useNavigate()
  const { has } = useAuth()
  const [status, setStatus] = useState('')
  const list = usePagedList('/hr/leave', { status: status || undefined })

  return (
    <>
      <PageHeader
        title="Leave requests"
        subtitle="Transactions"
        actions={
          has('hr.leave.edit') && (
            <Button variant="primary" onClick={() => navigate('/hr/leave/new')}>
              New request
            </Button>
          )
        }
      />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search employee or reason…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search leave requests"
          style={{ maxWidth: '320px' }}
        />
        <SelectInput
          options={STATUS_FILTER}
          placeholder="All statuses"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          style={{ maxWidth: '200px' }}
        />
      </div>

      <DataTable
        caption="Leave requests"
        columns={COLUMNS}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.leaveRequestId}
        onRowClick={(row) => navigate(`/hr/leave/${row.leaveRequestId}`)}
        emptyMessage="No leave requests."
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
