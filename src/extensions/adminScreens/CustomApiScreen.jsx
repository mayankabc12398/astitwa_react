import { useCallback, useEffect, useState } from 'react'
import { api } from '../../core/api/client.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Field } from '../../core/controls/Field.jsx'
import { Modal } from '../../core/controls/Modal.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { NumberInput, SelectInput, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Badge, Card, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { usePagedList } from '../../core/hooks/usePagedList.js'
import { MonacoScriptEditor } from './MonacoScriptEditor.jsx'

const BLANK = {
  endpointId: 0,
  slug: '',
  title: '',
  httpMethod: 'POST',
  sqlText:
    'SELECT e.employee_id,\n' +
    '       e.employee_code,\n' +
    '       e.full_name\n' +
    'FROM   hr_employee e\n' +
    'WHERE  e.tenant_id = {tenant}\n' +
    '  AND  e.is_active = 1\n' +
    '  AND  e.department_id = @department_id\n' +
    'ORDER  BY e.full_name',
  params: [{ name: 'department_id', type: 'int', required: true, sample: '1' }],
  columns: [],
  maxRows: 100,
  requiredPermission: '',
  isActive: false,
  applyToAllTenants: false,
}

const EMPTY_META = {
  methods: ['GET', 'POST'],
  paramTypes: ['string', 'int', 'decimal', 'bool', 'date'],
  permissions: [],
  tenantToken: '{tenant}',
  canApplyToAllTenants: false,
}

/**
 * API Builder.
 *
 * An endpoint here is a row, not a deployment: the SELECT is stored, the runtime resolves
 * /api/x/<slug> against it per request, and a new one answers on the next call with nothing
 * built and nothing restarted.
 *
 * Two rules on this screen are not cosmetic and are enforced again on the server, because a
 * request posted by hand never sees a screen:
 *
 *   * The statement must carry {tenant} where the tenant id belongs. Nothing else can add
 *     that filter for the author — only they know which table holds the column.
 *   * Save waits for a passing test run, and the columns that test returned are what the
 *     whitelist is built from. Typing column names blind is how a whitelist ends up
 *     describing a query that no longer returns them.
 */
export default function CustomApiScreen() {
  const ui = useUi()
  const list = usePagedList('/admin/apis')

  const [meta, setMeta] = useState(EMPTY_META)
  const [editing, setEditing] = useState(null)
  const [test, setTest] = useState(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    api
      .get('/admin/apis/meta', { signal: controller.signal })
      .then((data) => setMeta({ ...EMPTY_META, ...(data ?? {}) }))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const openNew = useCallback(() => {
    setEditing({ ...BLANK, params: BLANK.params.map((p) => ({ ...p })) })
    setTest(null)
    setError('')
  }, [])

  const openExisting = useCallback(async (row) => {
    setError('')
    setTest(null)
    try {
      const found = await api.get(`/admin/apis/${row.endpointId}`)
      setEditing({
        ...BLANK,
        ...found,
        title: found.title ?? '',
        requiredPermission: found.requiredPermission ?? '',
        params: (found.params ?? []).map((p) => ({ sample: '', ...p })),
        columns: found.columns ?? [],
        applyToAllTenants: found.tenantId === null,
      })
    } catch (cause) {
      setError(cause?.message ?? 'The endpoint could not be loaded.')
    }
  }, [])

  /*
   * Anything that changes what runs invalidates the last test result.
   *
   * That is the whole point of the gate: a passing test on the previous statement says
   * nothing about the one now in the box, and leaving Save enabled would let it publish a
   * query nobody has run.
   */
  function setField(key, value) {
    setEditing((current) => ({ ...current, [key]: value }))
    if (key === 'sqlText' || key === 'params') setTest(null)
  }

  function setParam(index, key, value) {
    setEditing((current) => {
      const params = current.params.map((p, i) => (i === index ? { ...p, [key]: value } : p))
      return { ...current, params }
    })
    setTest(null)
  }

  function addParam() {
    setEditing((current) => ({
      ...current,
      params: [...current.params, { name: '', type: 'string', required: false, sample: '' }],
    }))
    setTest(null)
  }

  function removeParam(index) {
    setEditing((current) => ({ ...current, params: current.params.filter((_, i) => i !== index) }))
    setTest(null)
  }

  function toggleColumn(column) {
    setEditing((current) => {
      const chosen = current.columns.includes(column)
        ? current.columns.filter((c) => c !== column)
        : [...current.columns, column]
      return { ...current, columns: chosen }
    })
  }

  async function runTest() {
    setTesting(true)
    setError('')
    try {
      const result = await api.post('/admin/apis/test', {
        sqlText: editing.sqlText,
        params: editing.params,
        // No whitelist on a test run: the columns that come back are what the author picks
        // from, and asking for a whitelist before they have seen the shape is backwards.
        columns: [],
        maxRows: 25,
      })
      setTest(result)

      if (result?.ok) {
        ui.toast(`${result.rows.length} row(s) in ${result.durationMs} ms.`)

        // A first run has nothing chosen yet, so everything the query returns is selected.
        // A later run only prunes: a column that no longer exists cannot stay whitelisted.
        setEditing((current) => ({
          ...current,
          columns:
            current.columns.length === 0
              ? result.columns
              : current.columns.filter((c) => result.columns.includes(c)),
        }))
      }
    } catch (cause) {
      setError(cause?.message ?? 'The test could not be run.')
      setTest({ ok: false, error: cause?.message })
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const saved = await api.post('/admin/apis', {
        ...editing,
        requiredPermission: editing.requiredPermission || null,
        title: editing.title || null,
      })
      ui.toast(saved?.isActive ? `Live at /api/x/${saved.slug}` : 'Endpoint saved. Activate it to publish the URL.')
      setEditing(null)
      list.refresh()
    } catch (cause) {
      setError(cause?.message ?? 'The endpoint could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row) {
    try {
      await api.post(`/admin/apis/${row.endpointId}/active`, { isActive: !row.isActive })
      ui.toast(row.isActive ? 'Endpoint taken offline.' : `Live at /api/x/${row.slug}`)
      list.refresh()
    } catch (cause) {
      ui.error(cause?.message ?? 'The endpoint could not be updated.')
    }
  }

  async function remove(row) {
    const confirmed = await ui.confirm({
      title: 'Delete endpoint',
      message: `Delete /api/x/${row.slug}? Anything calling it starts failing immediately.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!confirmed) return

    try {
      await api.del(`/admin/apis/${row.endpointId}`)
      ui.toast('Endpoint deleted.')
      list.refresh()
    } catch (cause) {
      ui.error(cause?.message ?? 'The endpoint could not be deleted.')
    }
  }

  async function openHistory(row) {
    try {
      const versions = await api.get(`/admin/apis/${row.endpointId}/history`)
      setHistory({ endpoint: row, versions: versions ?? [] })
    } catch (cause) {
      ui.error(cause?.message ?? 'History could not be loaded.')
    }
  }

  async function rollback(version) {
    const confirmed = await ui.confirm({
      title: 'Roll back',
      message: `Restore version ${version.versionNo}? The current version is archived first, so this can be undone.`,
      confirmLabel: 'Roll back',
    })
    if (!confirmed) return

    try {
      await api.post(`/admin/apis/${history.endpoint.endpointId}/rollback/${version.historyId}`)
      ui.toast(`Rolled back to version ${version.versionNo}.`)
      setHistory(null)
      list.refresh()
    } catch (cause) {
      ui.error(cause?.message ?? 'The rollback failed.')
    }
  }

  const columns = [
    { key: 'slug', label: 'Address', render: (r) => <code>/api/x/{r.slug}</code> },
    { key: 'title', label: 'Title' },
    { key: 'httpMethod', label: 'Method', width: '90px' },
    {
      key: 'tenantId',
      label: 'Applies to',
      width: '130px',
      render: (r) => (r.tenantId === null ? <Badge tone="warn">All tenants</Badge> : <Badge>This tenant</Badge>),
    },
    { key: 'versionNo', label: 'Version', width: '90px' },
    {
      key: 'isActive',
      label: 'Live',
      width: '100px',
      render: (r) => <Badge tone={r.isActive ? 'ok' : 'muted'}>{r.isActive ? 'Live' : 'Offline'}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      width: '320px',
      render: (row) => (
        <span style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); openExisting(row) }}>
            Edit
          </Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); openHistory(row) }}>
            History
          </Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); toggleActive(row) }}>
            {row.isActive ? 'Take offline' : 'Publish'}
          </Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); remove(row) }}>
            Delete
          </Button>
        </span>
      ),
    },
  ]

  const previewColumns = (test?.columns ?? []).map((c) => ({
    key: c,
    label: c,
    render: (row) => (row[c] === null || row[c] === undefined ? '—' : String(row[c])),
  }))

  return (
    <>
      <PageHeader
        title="API Builder"
        subtitle="Layer 5 — an endpoint is a row, not a deployment. No build, no restart."
        actions={
          <Button variant="primary" onClick={openNew}>
            New endpoint
          </Button>
        }
      />

      {error && !editing && <Alert tone="error">{error}</Alert>}
      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search address or title…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search endpoints"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <DataTable
        caption="Custom endpoints"
        columns={columns}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.endpointId}
        emptyMessage="No endpoints yet."
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
          title={editing.endpointId ? `/api/x/${editing.slug}` : 'New endpoint'}
          onClose={() => setEditing(null)}
          closeOnBackdrop={false}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={runTest} busy={testing}>
                Test
              </Button>
              <Button
                variant="primary"
                onClick={save}
                busy={saving}
                disabled={!test?.ok || editing.columns.length === 0}
                title={test?.ok ? undefined : 'Run a passing test before saving.'}
              >
                {editing.isActive ? 'Save and publish' : 'Save'}
              </Button>
            </>
          }
        >
          {error && <Alert tone="error">{error}</Alert>}

          <div className="form-grid">
            <Field
              label="Address"
              required
              htmlFor="slug"
              hint={editing.slug ? `Answers at /api/x/${editing.slug}` : 'Lowercase letters, digits and hyphens.'}
            >
              <TextInput
                id="slug"
                value={editing.slug}
                maxLength={80}
                onChange={(e) => setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              />
            </Field>

            <Field label="Title" htmlFor="title" hint="What this endpoint is for. Shown in the list only.">
              <TextInput
                id="title"
                value={editing.title}
                maxLength={150}
                onChange={(e) => setField('title', e.target.value)}
              />
            </Field>

            <Field label="Method" required htmlFor="httpMethod" hint="GET takes its parameters from the query string.">
              <SelectInput
                id="httpMethod"
                options={(meta.methods ?? []).map((m) => ({ value: m, label: m }))}
                value={editing.httpMethod}
                onChange={(e) => setField('httpMethod', e.target.value)}
              />
            </Field>

            <Field label="Max rows" htmlFor="maxRows" hint="Applied by the database, 1 to 1000.">
              <NumberInput
                id="maxRows"
                min="1"
                max="1000"
                value={editing.maxRows}
                onChange={(e) => setField('maxRows', Number(e.target.value))}
              />
            </Field>

            <Field
              label="Required permission"
              htmlFor="requiredPermission"
              hint="Checked against the caller. Blank means any signed-in user of this tenant."
            >
              <SelectInput
                id="requiredPermission"
                options={(meta.permissions ?? []).map((p) => ({ value: p, label: p }))}
                placeholder="— any signed-in user —"
                value={editing.requiredPermission}
                onChange={(e) => setField('requiredPermission', e.target.value)}
              />
            </Field>

            <Field label="Scope" htmlFor="scope">
              <span style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'center', minHeight: '34px' }}>
                <label style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={editing.applyToAllTenants}
                    disabled={!meta.canApplyToAllTenants}
                    onChange={(e) => setField('applyToAllTenants', e.target.checked)}
                  />
                  All tenants
                </label>
                <label style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={editing.isActive}
                    onChange={(e) => setField('isActive', e.target.checked)}
                  />
                  Live
                </label>
              </span>
            </Field>
          </div>

          <Field
            label="Statement"
            htmlFor="sqlText"
            hint={`One SELECT. Write ${meta.tenantToken} where the tenant id belongs, and @name for each parameter.`}
          >
            <MonacoScriptEditor
              language="mysql"
              value={editing.sqlText}
              onChange={(next) => setField('sqlText', next)}
            />
          </Field>

          <Card>
            <div className="toolbar">
              <strong>Parameters</strong>
              <span className="field__hint">
                Bound by name. Anything a caller sends that is not declared here is dropped.
              </span>
              <span style={{ marginLeft: 'auto' }}>
                <Button size="sm" onClick={addParam}>
                  Add parameter
                </Button>
              </span>
            </div>

            <DataTable
              caption="Parameters"
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  render: (row) => (
                    <TextInput
                      value={row.name}
                      aria-label="Parameter name"
                      onChange={(e) => setParam(row.__index, 'name', e.target.value)}
                    />
                  ),
                },
                {
                  key: 'type',
                  label: 'Type',
                  width: '140px',
                  render: (row) => (
                    <SelectInput
                      value={row.type}
                      aria-label="Parameter type"
                      options={(meta.paramTypes ?? []).map((t) => ({ value: t, label: t }))}
                      onChange={(e) => setParam(row.__index, 'type', e.target.value)}
                    />
                  ),
                },
                {
                  key: 'required',
                  label: 'Required',
                  width: '100px',
                  render: (row) => (
                    <input
                      type="checkbox"
                      checked={Boolean(row.required)}
                      aria-label="Required"
                      onChange={(e) => setParam(row.__index, 'required', e.target.checked)}
                    />
                  ),
                },
                {
                  key: 'sample',
                  label: 'Test value',
                  render: (row) => (
                    <TextInput
                      value={row.sample ?? ''}
                      aria-label="Test value"
                      onChange={(e) => setParam(row.__index, 'sample', e.target.value)}
                    />
                  ),
                },
                {
                  key: 'actions',
                  label: '',
                  width: '90px',
                  render: (row) => (
                    <Button size="sm" onClick={() => removeParam(row.__index)}>
                      Remove
                    </Button>
                  ),
                },
              ]}
              rows={editing.params.map((p, index) => ({ ...p, __index: index }))}
              rowKey={(row) => row.__index}
              emptyMessage="No parameters. The statement runs as written."
            />
          </Card>

          {test && !test.ok && <Alert tone="error">{test.error}</Alert>}

          {test?.ok && (
            <Card>
              <div className="toolbar">
                <strong>Output columns</strong>
                <span className="field__hint">
                  {editing.columns.length} of {test.columns.length} chosen. A column left unticked never leaves the
                  server, however the statement changes later.
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)' }}>
                {test.columns.map((column) => (
                  <label key={column} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={editing.columns.includes(column)}
                      onChange={() => toggleColumn(column)}
                    />
                    {column}
                  </label>
                ))}
              </div>

              <p className="field__hint">
                {test.rows.length} row(s) in {test.durationMs} ms{test.truncated ? ', and there were more' : ''}.
              </p>

              <DataTable
                caption="Test rows"
                columns={previewColumns}
                rows={test.rows}
                rowKey={(_row, index) => index}
                emptyMessage="The statement ran and returned no rows."
              />
            </Card>
          )}

          {!test && <Alert tone="warn">Save is disabled until a test run has passed.</Alert>}

          {editing.endpointId > 0 && (
            <Field label="Calling it" htmlFor="usage">
              <pre
                id="usage"
                style={{
                  whiteSpace: 'pre-wrap',
                  background: 'var(--c-surface-alt)',
                  padding: 'var(--s-3)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                {usageSnippet(editing)}
              </pre>
            </Field>
          )}
        </Modal>
      )}

      {history && (
        <Modal title={`Version history — /api/x/${history.endpoint.slug}`} onClose={() => setHistory(null)}>
          <Card>
            <DataTable
              caption="Versions"
              columns={[
                { key: 'versionNo', label: 'Version', width: '90px' },
                { key: 'slug', label: 'Address' },
                {
                  key: 'archivedOn',
                  label: 'Archived',
                  render: (v) => (v.archivedOn ? String(v.archivedOn).replace('T', ' ').slice(0, 19) : '—'),
                },
                {
                  key: 'actions',
                  label: '',
                  width: '140px',
                  render: (v) => (
                    <Button size="sm" onClick={() => rollback(v)}>
                      Roll back
                    </Button>
                  ),
                },
              ]}
              rows={history.versions}
              rowKey={(v) => v.historyId}
              emptyMessage="No earlier versions."
            />
          </Card>
        </Modal>
      )}
    </>
  )
}

/**
 * What the author copies into whatever is going to call this.
 *
 * Written from the endpoint as saved rather than from a template, so the parameters shown
 * are the ones it actually declares.
 */
function usageSnippet(endpoint) {
  const params = endpoint.params.filter((p) => p.name)

  if (endpoint.httpMethod === 'GET') {
    const query = params.map((p) => `${p.name}=${p.sample || `<${p.type}>`}`).join('&')
    return `GET /api/x/${endpoint.slug}${query ? `?${query}` : ''}\nAuthorization: Bearer <token>`
  }

  const body = params.reduce((acc, p) => ({ ...acc, [p.name]: p.sample || `<${p.type}>` }), {})

  return [
    `POST /api/x/${endpoint.slug}`,
    'Authorization: Bearer <token>',
    'Content-Type: application/json',
    '',
    JSON.stringify(body, null, 2),
  ].join('\n')
}
