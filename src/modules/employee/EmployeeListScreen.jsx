import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Badge, PageHeader } from '../../core/controls/layout.jsx'
import { usePagedList } from '../../core/hooks/usePagedList.js'

const COLUMNS = [
  { key: 'employeeCode', label: 'Code', width: '130px' },
  { key: 'fullName', label: 'Name' },
  { key: 'departmentName', label: 'Department' },
  { key: 'designationName', label: 'Designation' },
  { key: 'mobile', label: 'Mobile', width: '140px' },
  {
    key: 'employmentStatus',
    label: 'Status',
    width: '120px',
    render: (row) => (
      <Badge tone={row.employmentStatus === 'Active' ? 'ok' : 'muted'}>{row.employmentStatus}</Badge>
    ),
  },
]

export default function EmployeeListScreen() {
  const navigate = useNavigate()
  const { has } = useAuth()
  const list = usePagedList('/hr/employee')

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Master data"
        actions={
          has('hr.employee.edit') && (
            <Button variant="primary" onClick={() => navigate('/hr/employee/new')}>
              New employee
            </Button>
          )
        }
      />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search code, name, mobile or email…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search employees"
          style={{ maxWidth: '360px' }}
        />
      </div>

      <DataTable
        caption="Employees"
        columns={COLUMNS}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.employeeId}
        onRowClick={(row) => navigate(`/hr/employee/${row.employeeId}`)}
        emptyMessage="No employees yet."
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
