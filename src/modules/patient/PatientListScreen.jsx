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

/**
 * Names are stored in two columns and read as one. fullName is the column they replaced —
 * read while the API still serves rows under it, and droppable with it.
 */
const asName = (row) => [row.firstName, row.lastName].filter(Boolean).join(' ') || row.fullName || '—'

/** 34 YRS, 6 MTH, 3 DAYS — the unit is half the answer on a paediatric list. */
const asAge = (row) => (row.age === null || row.age === undefined || row.age === '' ? '—' : `${row.age} ${row.ageType ?? ''}`.trim())

const COLUMNS = [
  { key: 'patientCode', label: 'UHID', width: '120px' },
  { key: 'barcode', label: 'Barcode', width: '120px' },
  { key: 'patientName', label: 'Patient Name', render: asName },
  { key: 'gender', label: 'Gender', width: '100px' },
  { key: 'age', label: 'Age', width: '100px', render: asAge },
  { key: 'mobileNo', label: 'Mobile', width: '140px', render: (row) => row.mobileNo || row.mobile || '—' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City', width: '130px' },
  { key: 'patientType', label: 'Patient Type', width: '120px' },
  { key: 'registeredOn', label: 'Registered', width: '120px', render: (row) => asDate(row.registeredOn) },
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
          placeholder="Search UHID, barcode, name, mobile or email…"
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
