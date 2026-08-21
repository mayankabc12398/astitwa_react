import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, PageHeader } from '../../core/controls/layout.jsx'
import { usePagedList } from '../../core/hooks/usePagedList.js'

const COLUMNS = [
  { key: 'desigCode', label: 'Code', width: '160px' },
  { key: 'desigName', label: 'Name' },
  { key: 'grade', label: 'Grade', width: '140px' },
]

export default function DesignationListScreen() {
  const navigate = useNavigate()
  const { has } = useAuth()
  const list = usePagedList('/hr/designation')

  return (
    <>
      <PageHeader
        title="Designations"
        subtitle="Master data"
        actions={
          has('hr.designation.edit') && (
            <Button variant="primary" onClick={() => navigate('/hr/designation/new')}>
              New designation
            </Button>
          )
        }
      />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search code, name or grade…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search designations"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <DataTable
        caption="Designations"
        columns={COLUMNS}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.designationId}
        onRowClick={(row) => navigate(`/hr/designation/${row.designationId}`)}
        emptyMessage="No designations yet."
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
