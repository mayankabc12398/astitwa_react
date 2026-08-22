import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CalendarClock, FileCheck2, FileClock, FilePlus2, FileText, PenLine } from 'lucide-react'
import { useAuth } from '../../core/auth/AuthContext.js'
import { NhrScope } from '../../config/nhr/NhrScope.jsx'
import {
  Badge, Chip, DataTable, MetricCard, PageHeader, Select, Skeleton, StatusBadge, useToast,
} from '../../config/nhr/ui/index.js'
import { BarChart } from '../../config/nhr/ui/charts.jsx'
import { fmtDate, fmtNum } from '../../config/nhr/format.js'
import { documentsApi } from './documentsApi.js'
import { DocumentDrawer } from './components/DocumentDrawer.jsx'
import { IssueDocumentModal } from './components/IssueDocumentModal.jsx'
import { metaFor, STATUS_OPTIONS } from './documentModel.js'
import './documents.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * One document type, as a card in the library.
 *
 * Clicking the card filters the register; the small action issues one straight from it,
 * which is the shortest path from "we need an offer letter" to a draft.
 */
function TypeCard({ type, count, active, onFilter, onIssue, canIssue }) {
  const meta = metaFor(type.documentType)
  const Icon = meta.icon

  return (
    <div
      className="card card-hover"
      onClick={onFilter}
      style={{
        padding: 16,
        cursor: 'pointer',
        borderTop: `3px solid var(--tint-${meta.tint}-ink)`,
        outline: active ? `2px solid var(--tint-${meta.tint}-ink)` : 'none',
        outlineOffset: 2,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="metric-icon"
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: `var(--tint-${meta.tint})`,
            color: `var(--tint-${meta.tint}-ink)`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={17} />
        </span>
        <span className="t-2xl fw-8 tabular">{count}</span>
      </div>

      <div className="t-sm fw-7 mt-2 truncate">{type.displayName}</div>

      <div className="flex items-center justify-between mt-1">
        <span className="t-xs ink-3">{count === 1 ? 'document on file' : 'documents on file'}</span>
        {canIssue && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: `var(--tint-${meta.tint}-ink)` }}
            onClick={(e) => {
              e.stopPropagation()
              onIssue()
            }}
          >
            issue <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The Documents Center.
 *
 * The register is paged by the server — it grows without limit — while the headline figures
 * and the gallery counts come from an aggregate, so they describe every document rather than
 * whichever page happens to be on screen.
 */
export default function DocumentsCenterScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { has } = useAuth()
  const toast = useToast()

  const canManage = has('hr.document.edit') || has('hr.document.issue')

  const [documentTypes, setDocumentTypes] = useState([])
  const [stats, setStats] = useState(null)
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [registerFetch, setRegisterFetch] = useState(null)
  const [attempt, setAttempt] = useState(0)

  const [issuing, setIssuing] = useState(false)
  const [presetType, setPresetType] = useState('')

  useEffect(() => {
    let alive = true
    documentsApi
      .documentTypes()
      .then((rows) => {
        if (alive) setDocumentTypes(rows ?? [])
      })
      .catch(() => {
        if (alive) setDocumentTypes([])
      })

    return () => {
      alive = false
    }
  }, [])

  const loadStats = useCallback(() => {
    documentsApi
      .stats()
      .then(setStats)
      .catch(() => setStats(null))
  }, [])

  // The query in effect, as one value. What was fetched is stored against it and the current
  // page derived by comparing the two — the same way usePagedList works, and the reason a
  // stale page can never be rendered as though it were fresh.
  const registerKey = JSON.stringify([page, pageSize, search, statusFilter, attempt])

  useEffect(() => {
    let alive = true

    documentsApi
      .list({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter === 'All' ? undefined : statusFilter,
      })
      .then((result) => {
        if (alive) setRegisterFetch({ key: registerKey, data: result })
      })
      .catch((cause) => {
        if (!alive) return
        toast.error('Could not load the register', cause?.message)
        setRegisterFetch({ key: registerKey, data: { items: [], totalCount: 0 } })
      })

    return () => {
      alive = false
    }
    // toast is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerKey])

  useEffect(() => loadStats(), [loadStats])

  const register = registerFetch?.key === registerKey ? registerFetch.data : null
  const loading = registerFetch?.key !== registerKey

  const refresh = () => {
    setAttempt((n) => n + 1)
    loadStats()
  }

  // The type filter is applied to the page in hand rather than sent to the server: the API
  // filters by status and employee, not by type, and adding a parameter for one screen's
  // chip row would be the wrong place to put it.
  const rows = useMemo(() => {
    const items = register?.items ?? []
    return typeFilter === 'All' ? items : items.filter((d) => d.documentType === typeFilter)
  }, [register, typeFilter])

  const monthly = useMemo(
    () =>
      (stats?.byMonth ?? []).map((m) => {
        const [year, month] = m.period.split('-')
        return { label: `${MONTHS[Number(month) - 1]} '${year.slice(2)}`, issued: m.documentCount }
      }),
    [stats],
  )

  const ackRate = stats?.deliveredCount ? Math.round((stats.acknowledgedCount / stats.deliveredCount) * 100) : 0

  const columns = [
    { key: 'refNo', header: 'Reference', accessor: 'refNo', width: 170 },
    { key: 'employeeName', header: 'Employee', accessor: 'employeeName' },
    {
      key: 'documentType',
      header: 'Document',
      accessor: (r) => r.documentTypeName || r.documentType,
      render: (r) => <Badge tone="neutral">{r.documentTypeName || r.documentType}</Badge>,
    },
    { key: 'departmentName', header: 'Department', accessor: 'departmentName' },
    {
      key: 'effectiveDate',
      header: 'Effective',
      accessor: (r) => r.effectiveDate,
      render: (r) => fmtDate(r.effectiveDate),
      width: 130,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: 'status',
      render: (r) => <StatusBadge status={r.status} />,
      width: 150,
    },
  ]

  return (
    <NhrScope>
      <div className="page">
        <PageHeader
          icon={<FileText size={20} />}
          tint="lavender"
          title="Employee Documents Center"
          desc={
            canManage
              ? 'Issue, sign, deliver and track every HR letter — offers, appointments, promotions, renewals and more.'
              : 'View and print the letters issued to you.'
          }
          crumbs={[{ label: 'Workforce' }, { label: 'Documents Center' }]}
          actions={
            canManage ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPresetType('')
                  setIssuing(true)
                }}
              >
                <FilePlus2 size={15} /> Issue document
              </button>
            ) : null
          }
        />

        <div className="kpi-grid stagger">
          <MetricCard
            label="Documents issued"
            value={stats ? fmtNum(stats.deliveredCount) : '…'}
            tint="lavender"
            icon={<FileCheck2 size={19} />}
            footer={stats ? `${stats.acknowledgedCount} acknowledged · ${stats.expiredCount} expired` : ' '}
          />
          <MetricCard
            label="Pending signature"
            value={stats ? fmtNum(stats.pendingSignatureCount) : '…'}
            tint="peach"
            icon={<PenLine size={19} />}
            footer={stats ? `${stats.draftCount} more draft(s) in the queue` : ' '}
          />
          <MetricCard
            label="Awaiting acknowledgement"
            value={stats ? fmtNum(stats.issuedCount) : '…'}
            tint="lemon"
            icon={<FileClock size={19} />}
            footer="Issued and delivered — no sign-off yet"
          />
          <MetricCard
            label="Lapsing within 90 days"
            value={stats ? fmtNum(stats.expiring90Count) : '…'}
            tint="rose"
            icon={<CalendarClock size={19} />}
            footer={
              stats
                ? stats.nextExpiry
                  ? `${stats.datedCount} dated · next lapse ${fmtDate(stats.nextExpiry)}`
                  : 'Nothing with a term is due to lapse'
                : ' '
            }
          />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="t-md fw-8">Document library</div>
            <div className="t-sm ink-3">
              {canManage
                ? 'Every document this product issues — click a card to filter the register, or issue straight from it.'
                : 'Click a card to filter your documents.'}
            </div>
          </div>
          {typeFilter !== 'All' && (
            <button className="btn btn-ghost btn-sm" onClick={() => setTypeFilter('All')}>
              Clear type filter
            </button>
          )}
        </div>

        {!stats ? (
          <div className="dc-type-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} h={122} r={16} />
            ))}
          </div>
        ) : (
          <div className="dc-type-grid stagger">
            {(stats.byType ?? []).map((t) => (
              <TypeCard
                key={t.documentType}
                type={t}
                count={t.documentCount}
                active={typeFilter === t.documentType}
                canIssue={canManage}
                onFilter={() => setTypeFilter((f) => (f === t.documentType ? 'All' : t.documentType))}
                onIssue={() => {
                  setPresetType(t.documentType)
                  setIssuing(true)
                }}
              />
            ))}
          </div>
        )}

        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          serverMode
          totalCount={typeFilter === 'All' ? (register?.totalCount ?? 0) : rows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
          onSearchChange={(q) => {
            setSearch(q)
            setPage(1)
          }}
          searchPlaceholder="Search reference, employee or subject…"
          exportName="documents-register.csv"
          onRowClick={(row) => navigate(`/hr/documents/${row.documentId}`)}
          emptyTitle="No documents match"
          emptyDesc="Clear the type chips or the status filter and try again."
          toolbarLeft={
            <>
              <div className="flex gap-1 flex-wrap items-center">
                <Chip active={typeFilter === 'All'} onClick={() => setTypeFilter('All')}>
                  All types
                </Chip>
                {(stats?.byType ?? []).map((t) => (
                  <Chip
                    key={t.documentType}
                    active={typeFilter === t.documentType}
                    onClick={() => setTypeFilter((f) => (f === t.documentType ? 'All' : t.documentType))}
                  >
                    {metaFor(t.documentType).short}
                  </Chip>
                ))}
              </div>
              <Select
                options={[{ value: 'All', label: 'All statuses' }, ...STATUS_OPTIONS]}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
              />
            </>
          }
        />

        {typeFilter !== 'All' && (
          <div className="t-xs ink-3">
            The type filter applies to the page on screen. Clear it to page through the whole register.
          </div>
        )}

        <div className="dc-two">
          <div className="card card-pad anim-fade-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="card-title">Documents created per month</div>
                <div className="card-sub">Every type, over the last twelve months</div>
              </div>
              <Badge tone="neutral">{stats ? `${stats.totalCount} total` : '…'}</Badge>
            </div>

            {monthly.length > 0 ? (
              <BarChart
                height={200}
                data={monthly}
                series={[{ key: 'issued', label: 'Documents' }]}
                formatValue={fmtNum}
                showLegend={false}
              />
            ) : (
              <div className="t-sm ink-3">Nothing has been created in the last twelve months.</div>
            )}
          </div>

          <div className="card card-pad anim-fade-up">
            <div className="card-title mb-1">Acknowledgement</div>
            <div className="card-sub mb-4">Of everything that has left the building</div>

            <div className="t-3xl fw-8 tabular">{ackRate}%</div>
            <div className="t-sm ink-3 mb-3">
              {stats ? `${stats.acknowledgedCount} of ${stats.deliveredCount} signed off` : '…'}
            </div>

            <div className="progress-track" style={{ height: 8 }}>
              <div className="progress-fill" style={{ width: `${ackRate}%`, background: 'var(--primary)' }} />
            </div>

            <div className="flex flex-col gap-2 mt-4">
              {STATUS_OPTIONS.map((s) => {
                const key = `${s.value.replace(/\s/g, '').charAt(0).toLowerCase()}${s.value.replace(/\s/g, '').slice(1)}Count`
                const count = stats?.[key] ?? 0
                return (
                  <div key={s.value} className="flex items-center justify-between t-sm">
                    <StatusBadge status={s.value} />
                    <span className="tabular ink-2">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {id && (
          <DocumentDrawer
            documentId={Number(id)}
            typeLabel={documentTypes.find((d) => d.documentType === register?.items?.find((r) => String(r.documentId) === String(id))?.documentType)?.displayName}
            canManage={canManage}
            onClose={() => navigate('/hr/documents')}
            onChanged={refresh}
          />
        )}

        <IssueDocumentModal
          open={issuing}
          presetType={presetType}
          documentTypes={documentTypes}
          onClose={() => setIssuing(false)}
          onIssued={(saved) => {
            refresh()
            toast.success('Draft created', saved?.refNo)
            navigate(`/hr/documents/${saved.documentId}`)
          }}
        />
      </div>
    </NhrScope>
  )
}
