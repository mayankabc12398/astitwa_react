import { useCallback, useState } from 'react'
import { api } from '../../core/api/client.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Field } from '../../core/controls/Field.jsx'
import { Modal } from '../../core/controls/Modal.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { NumberInput, TextArea, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Badge, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { usePagedList } from '../../core/hooks/usePagedList.js'

const BLANK = {
  queryId: 0,
  queryKey: '',
  procName: '',
  params: [],
  columns: [],
  maxRows: 100,
  requiredPermission: '',
  isActive: true,
  applyToAllTenants: false,
}

const PARAM_TYPES = ['string', 'int', 'decimal', 'bool', 'date']

/**
 * Named Queries (section 10.6).
 *
 * This screen is the entire surface a script can reach in the database. A key names one
 * stored procedure, declares the parameters that may be bound and whitelists the columns
 * that may come back. Nothing outside those lists ever reaches a script.
 */
export default function NamedQueriesScreen() {
  const ui = useUi()
  const list = usePagedList('/admin/queries')

  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  const openNew = useCallback(() => {
    setEditing({ ...BLANK })
    setError('')
    setPreview(null)
  }, [])

  const openExisting = useCallback(async (row) => {
    setError('')
    setPreview(null)
    try {
      const found = await api.get(`/admin/queries/${row.queryId}`)
      setEditing({
        ...BLANK,
        ...found,
        requiredPermission: found.requiredPermission ?? '',
        applyToAllTenants: found.tenantId === null,
      })
    } catch (cause) {
      setError(cause?.message ?? 'The query could not be loaded.')
    }
  }, [])

  function setField(key, value) {
    setEditing((current) => ({ ...current, [key]: value }))
  }

  function setParam(index, key, value) {
    setEditing((current) => {
      const params = current.params.slice()
      params[index] = { ...params[index], [key]: value }
      return { ...current, params }
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await api.post('/admin/queries', {
        ...editing,
        requiredPermission: editing.requiredPermission || null,
      })
      ui.toast('Query registered.')
      setEditing(null)
      list.refresh()
    } catch (cause) {
      setError(cause?.message ?? 'The query could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function run() {
    setError('')
    try {
      const params = {}
      for (const p of editing.params) params[p.name] = p.sample ?? ''
      const result = await api.post('/admin/queries/run', { queryKey: editing.queryKey, params })
      setPreview(result)
    } catch (cause) {
      setError(cause?.message ?? 'The query could not be run.')
    }
  }

  const columns = [
    { key: 'queryKey', label: 'Key' },
    { key: 'procName', label: 'Procedure' },
    { key: 'maxRows', label: 'Max rows', width: '100px' },
    {
      key: 'tenantId',
      label: 'Applies to',
      width: '130px',
      render: (r) => (r.tenantId === null ? <Badge tone="warn">All tenants</Badge> : <Badge>This tenant</Badge>),
    },
    {
      key: 'isActive',
      label: 'Active',
      width: '100px',
      render: (r) => <Badge tone={r.isActive ? 'ok' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Named queries"
        subtitle="The only database access a script has"
        actions={
          <Button variant="primary" onClick={openNew}>
            Register a query
          </Button>
        }
      />

      {error && !editing && <Alert tone="error">{error}</Alert>}
      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search key or procedure…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search named queries"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <DataTable
        caption="Named queries"
        columns={columns}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.queryId}
        onRowClick={openExisting}
        emptyMessage="No queries registered."
      />

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        totalCount={list.totalCount}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
      />

      {editing && (
        <Modal
          title={editing.queryId ? editing.queryKey : 'Register a query'}
          onClose={() => setEditing(null)}
          closeOnBackdrop={false}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={run} disabled={!editing.queryId}>
                Run
              </Button>
              <Button variant="primary" onClick={save} busy={saving}>
                Save
              </Button>
            </>
          }
        >
          {error && <Alert tone="error">{error}</Alert>}

          <div className="form-grid">
            <Field label="Query key" required htmlFor="queryKey" hint="What a script passes to api.query().">
              <TextInput
                id="queryKey"
                value={editing.queryKey}
                onChange={(e) => setField('queryKey', e.target.value)}
                placeholder="hr.employee.searchByMobile"
              />
            </Field>

            <Field label="Stored procedure" required htmlFor="procName" hint="The only thing executed.">
              <TextInput
                id="procName"
                value={editing.procName}
                onChange={(e) => setField('procName', e.target.value)}
                placeholder="sp_hr_employee_search_by_mobile"
              />
            </Field>

            <Field label="Max rows" htmlFor="maxRows">
              <NumberInput id="maxRows" value={editing.maxRows} onChange={(e) => setField('maxRows', Number(e.target.value))} />
            </Field>

            <Field label="Required permission" htmlFor="requiredPermission" hint="Optional. Checked server-side.">
              <TextInput
                id="requiredPermission"
                value={editing.requiredPermission}
                onChange={(e) => setField('requiredPermission', e.target.value)}
                placeholder="hr.employee.view"
              />
            </Field>
          </div>

          <Field
            label="Declared parameters"
            htmlFor="params"
            hint="Only these are bound. The p_ prefix is added for you."
          >
            <div>
              {editing.params.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--s-2)', marginBottom: 'var(--s-2)' }}>
                  <TextInput
                    placeholder="name"
                    value={p.name ?? ''}
                    onChange={(e) => setParam(i, 'name', e.target.value)}
                    aria-label={`Parameter ${i + 1} name`}
                  />
                  <select
                    className="select"
                    style={{ maxWidth: '130px' }}
                    value={p.type ?? 'string'}
                    onChange={(e) => setParam(i, 'type', e.target.value)}
                    aria-label={`Parameter ${i + 1} type`}
                  >
                    {PARAM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: 'flex', gap: 'var(--s-1)', alignItems: 'center', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(p.required)}
                      onChange={(e) => setParam(i, 'required', e.target.checked)}
                    />
                    required
                  </label>
                  <TextInput
                    placeholder="sample value"
                    value={p.sample ?? ''}
                    onChange={(e) => setParam(i, 'sample', e.target.value)}
                    aria-label={`Parameter ${i + 1} sample`}
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      setField(
                        'params',
                        editing.params.filter((_, idx) => idx !== i),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button size="sm" onClick={() => setField('params', [...editing.params, { name: '', type: 'string' }])}>
                Add parameter
              </Button>
            </div>
          </Field>

          <Field
            label="Output columns"
            htmlFor="columns"
            hint="One per line. Anything the procedure returns that is not listed here is stripped."
          >
            <TextArea
              id="columns"
              rows={5}
              value={editing.columns.join('\n')}
              onChange={(e) =>
                setField(
                  'columns',
                  e.target.value
                    .split('\n')
                    .map((c) => c.trim())
                    .filter(Boolean),
                )
              }
              placeholder={'employee_id\nemployee_code\nfull_name\nmobile'}
            />
          </Field>

          <label style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={editing.applyToAllTenants}
              onChange={(e) => setField('applyToAllTenants', e.target.checked)}
            />
            Register for all tenants
          </label>

          {preview && (
            <Alert tone={preview.ok ? 'info' : 'error'}>
              {preview.ok ? (
                <>
                  {preview.rows.length} row(s), columns: {preview.columns.join(', ')}
                  {preview.truncated && ' (truncated at the row cap)'}
                </>
              ) : (
                <>{preview.error}</>
              )}
            </Alert>
          )}
        </Modal>
      )}
    </>
  )
}
