import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, PageHeader } from '../../core/controls/layout.jsx'
import { usePagedList } from '../../core/hooks/usePagedList.js'

const COLUMNS = [
  { key: 'deptCode', label: 'Code', width: '160px' },
  { key: 'deptName', label: 'Name' },
]

export default function DepartmentListScreen() {
  const navigate = useNavigate()
  const { has } = useAuth()
  const list = usePagedList('/hr/department')

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="Master data"
        actions={
          has('hr.department.edit') && (
            <Button variant="primary" onClick={() => navigate('/hr/department/new')}>
              New department
            </Button>
          )
        }
      />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search code or name…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search departments"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <DataTable
        caption="Departments"
        columns={COLUMNS}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.departmentId}
        onRowClick={(row) => navigate(`/hr/department/${row.departmentId}`)}
        emptyMessage="No departments yet."
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
