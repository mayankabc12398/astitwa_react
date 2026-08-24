import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, PageHeader } from '../../core/controls/layout.jsx'
import { usePagedList } from '../../core/hooks/usePagedList.js'

/** The API sends full timestamps; a registration date is a date. */
const asDate = (value) => (value ? String(value).slice(0, 10) : '—')

const COLUMNS = [
  { key: 'patientCode', label: 'UHID', width: '130px' },
  { key: 'fullName', label: 'Name' },
  { key: 'gender', label: 'Gender', width: '110px' },
  { key: 'mobile', label: 'Mobile', width: '140px' },
  { key: 'city', label: 'City', width: '150px' },
  { key: 'registeredOn', label: 'Registered', width: '130px', render: (row) => asDate(row.registeredOn) },
]

export default function PatientListScreen() {
  const navigate = useNavigate()
  const { has } = useAuth()
  const list = usePagedList('/hr/patient')

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="Registration"
        actions={
          has('hr.patient.edit') && (
            <Button variant="primary" onClick={() => navigate('/hr/patient/new')}>
              New patient
            </Button>
          )
        }
      />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search UHID, name, mobile or email…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search patients"
          style={{ maxWidth: '360px' }}
        />
      </div>

      <DataTable
        caption="Patients"
        columns={COLUMNS}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.patientId}
        onRowClick={(row) => navigate(`/hr/patient/${row.patientId}`)}
        emptyMessage="No patients registered yet."
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
