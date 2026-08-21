import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { Alert, PageHeader } from '../../core/controls/layout.jsx'
import { usePagedList } from '../../core/hooks/usePagedList.js'

/**
 * Layer 3 add-on screen, deliberately a stub. Its job is to prove the pattern:
 * a whole module arrives as its own chunk, its own controller and its own licence row,
 * and base code never mentions it.
 *
 * Payroll calculation itself is an explicit non-goal (section 14).
 */
const COLUMNS = [
  { key: 'periodLabel', label: 'Period', width: '180px' },
  { key: 'status', label: 'Status', width: '140px' },
  { key: 'employeeCount', label: 'Employees', width: '120px' },
  { key: 'runOn', label: 'Run on', render: (r) => (r.runOn ? String(r.runOn).slice(0, 10) : '—') },
]

export default function PayrollRunsScreen() {
  const list = usePagedList('/payroll/runs')

  return (
    <>
      <PageHeader
        title="Payroll runs"
        subtitle="Payroll add-on — licensed per tenant via sys_tenant_module"
      />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <Alert tone="info">
        This add-on is a registration stub. It demonstrates per-tenant licensing, lazy loading and
        server-side module enforcement, not payroll processing.
      </Alert>

      <DataTable
        caption="Payroll runs"
        columns={COLUMNS}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.payrollRunId}
        emptyMessage="No payroll runs recorded."
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
