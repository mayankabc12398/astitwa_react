import { useCallback, useEffect, useState } from 'react'
import { api } from '../../core/api/client.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Field } from '../../core/controls/Field.jsx'
import { Modal } from '../../core/controls/Modal.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { NumberInput, SelectInput, TextArea, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Badge, Card, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { usePagedList } from '../../core/hooks/usePagedList.js'
import { useBootstrap } from '../../config/ConfigContext.js'
import { MonacoScriptEditor } from './MonacoScriptEditor.jsx'

const BLANK = {
  hookId: 0,
  hookKey: 'hr.employee.beforeSave',
  seqNo: 10,
  runOn: 'client',
  scriptBody: '// ctx, api, ui and utils are in scope.\n// Return { cancelSave, cancelNavigation, redirectTo, message } or nothing.\n',
  debounceMs: null,
  isActive: false,
  applyToAllTenants: false,
}

const SAMPLE = JSON.stringify(
  { employeeCode: 'E-1001', fullName: 'Sample Person', dateOfJoining: '2030-01-01', mobile: '9876543210' },
  null,
  2,
)

/**
 * Script Hooks (section 10.6).
 *
 * Save stays disabled until a test run has passed — an untested script cannot be activated
 * for a live tenant. Every save archives the previous version, so rollback is always one
 * click away.
 */
/**
 * Which catalogued page a hook key belongs to, or '' for one that matches none.
 *
 * Longest key first, so a screen whose key is a prefix of another cannot claim it.
 */
function screenKeyFor(hookKey, screens) {
  if (!hookKey) return ''

  const match = [...screens]
    .sort((a, b) => b.key.length - a.key.length)
    .find((screen) => hookKey === screen.key || hookKey.startsWith(`${screen.key}.`))

  return match ? match.key : ''
}

export default function ScriptHooksScreen() {
  const ui = useUi()
  const list = usePagedList('/admin/hooks')

  // Saving a script changes what the sandbox should be running. Without this the new
  // version only reached the browser on the next full page load, so the author tested a
  // hook, saw nothing happen, and had no way to tell whether the script was wrong or
  // simply not loaded. refresh() re-fetches the bootstrap payload; App.jsx sees the new
  // clientHooks array and reinstalls the engine.
  const { refresh: refreshConfig } = useBootstrap()

  const [slots, setSlots] = useState({ hookKeys: [], runTargets: [], screens: [] })
  const [editing, setEditing] = useState(null)
  const [sample, setSample] = useState(SAMPLE)
  const [test, setTest] = useState(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(null)

  // The page the slot list is filtered to. Held as an OVERRIDE, not as the truth: with
  // nothing picked it is derived from the hook key being edited, so opening an existing
  // hook lands on the right page without anyone storing that fact twice.
  const [pickedScreen, setPickedScreen] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    api
      .get('/admin/hooks/slots', { signal: controller.signal })
      .then((data) => setSlots(data ?? { hookKeys: [], runTargets: [], screens: [] }))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const openNew = useCallback(() => {
    setEditing({ ...BLANK })
    setTest(null)
    setError('')
    setPickedScreen(null)
  }, [])

  const openExisting = useCallback(async (row) => {
    setError('')
    setTest(null)
    try {
      const hook = await api.get(`/admin/hooks/${row.hookId}`)
      setEditing({ ...BLANK, ...hook, applyToAllTenants: hook.tenantId === null })
      setPickedScreen(null)
    } catch (cause) {
      setError(cause?.message ?? 'The hook could not be loaded.')
    }
  }, [])

  // Editing the body invalidates the previous test result. That is the whole point of the gate.
  const setField = (key, value) => {
    setEditing((current) => ({ ...current, [key]: value }))
    if (key === 'scriptBody' || key === 'runOn' || key === 'hookKey') setTest(null)
  }

  async function runTest() {
    setTesting(true)
    setError('')
    try {
      const result = await api.post('/admin/hooks/test', {
        hookKey: editing.hookKey,
        runOn: editing.runOn,
        scriptBody: editing.scriptBody,
        sampleFormJson: sample,
      })
      setTest(result)
      if (result.ok) ui.toast(`Ran in ${result.durationMs} ms.`)
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
      await api.post('/admin/hooks', editing)
      ui.toast('Hook saved and live.')
      setEditing(null)
      list.refresh()
      refreshConfig()
    } catch (cause) {
      setError(cause?.message ?? 'The hook could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row) {
    try {
      await api.post(`/admin/hooks/${row.hookId}/active`, { isActive: !row.isActive })
      ui.toast(row.isActive ? 'Hook deactivated.' : 'Hook activated.')
      list.refresh()
      refreshConfig()
    } catch (cause) {
      ui.error(cause?.message ?? 'The hook could not be updated.')
    }
  }

  async function openHistory(row) {
    try {
      const versions = await api.get(`/admin/hooks/${row.hookId}/history`)
      setHistory({ hook: row, versions: versions ?? [] })
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
      await api.post(`/admin/hooks/${history.hook.hookId}/rollback/${version.historyId}`)
      ui.toast(`Rolled back to version ${version.versionNo}.`)
      setHistory(null)
      list.refresh()
      refreshConfig()
    } catch (cause) {
      ui.error(cause?.message ?? 'The rollback failed.')
    }
  }

  // With a page in hand the editor offers that page's slots and one concrete slot per
  // field — 'Gross CTC — on blur' rather than a hr.employee.field.<fieldKey>.onBlur
  // placeholder to hand-edit. With no page, the full flat list is offered exactly as before,
  // so a hook key outside the catalogue stays editable.
  const screens = slots.screens ?? []
  const screenKey = pickedScreen ?? screenKeyFor(editing?.hookKey, screens)
  const activeScreen = screens.find((screen) => screen.key === screenKey) ?? null

  const hookPointOptions = activeScreen
    ? [
        ...(activeScreen.slots ?? []).map((slot) => ({ value: slot.key, label: slot.label })),
        ...(activeScreen.fields ?? []).map((field) => ({
          value: field.slotKey,
          label: `Field: ${field.label} — on blur`,
        })),
      ]
    : (slots.hookKeys ?? []).map((key) => ({ value: key, label: key }))

  const columns = [
    { key: 'hookKey', label: 'Hook point' },
    { key: 'runOn', label: 'Runs on', width: '100px' },
    { key: 'seqNo', label: 'Seq', width: '70px' },
    {
      key: 'tenantId',
      label: 'Applies to',
      width: '130px',
      render: (r) => (r.tenantId === null ? <Badge tone="warn">All tenants</Badge> : <Badge>This tenant</Badge>),
    },
    { key: 'versionNo', label: 'Version', width: '90px' },
    {
      key: 'isActive',
      label: 'Active',
      width: '110px',
      render: (r) => <Badge tone={r.isActive ? 'ok' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      width: '260px',
      render: (row) => (
        <span style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); openExisting(row) }}>
            Edit
          </Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); openHistory(row) }}>
            History
          </Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); toggleActive(row) }}>
            {row.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Script hooks"
        subtitle="Layer 5 — behaviour stored as data. No build, no deploy."
        actions={
          <Button variant="primary" onClick={openNew}>
            New hook
          </Button>
        }
      />

      {error && !editing && <Alert tone="error">{error}</Alert>}
      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search hook key…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search hooks"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <DataTable
        caption="Script hooks"
        columns={columns}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.hookId}
        emptyMessage="No hooks registered."
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
          title={editing.hookId ? `Hook ${editing.hookKey}` : 'New hook'}
          onClose={() => setEditing(null)}
          closeOnBackdrop={false}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={runTest} busy={testing}>
                Test with sample data
              </Button>
              <Button
                variant="primary"
                onClick={save}
                busy={saving}
                disabled={!test?.ok}
                title={test?.ok ? undefined : 'Run a passing test before saving.'}
              >
                {editing.isActive ? 'Save and activate' : 'Save'}
              </Button>
            </>
          }
        >
          {error && <Alert tone="error">{error}</Alert>}

          <div className="form-grid">
            <Field
              label="Page"
              htmlFor="screenKey"
              hint="Narrows the slots below to the ones that page actually has."
            >
              <SelectInput
                id="screenKey"
                options={screens.map((screen) => ({ value: screen.key, label: screen.label }))}
                placeholder="— all pages —"
                value={screenKey}
                // Only the filter changes. The hook key is left alone, so choosing a page
                // can never quietly repoint a hook somebody already saved.
                onChange={(e) => setPickedScreen(e.target.value)}
              />
            </Field>

            <Field label="Hook point" required htmlFor="hookKey">
              <SelectInput
                id="hookKey"
                options={hookPointOptions}
                placeholder="— choose a slot —"
                value={editing.hookKey}
                onChange={(e) => setField('hookKey', e.target.value)}
              />
            </Field>

            <Field
              label="Hook key (free text)"
              htmlFor="hookKeyText"
              hint="Field slots take a field name, e.g. hr.employee.field.mobile.onBlur"
            >
              <TextInput id="hookKeyText" value={editing.hookKey} onChange={(e) => setField('hookKey', e.target.value)} />
            </Field>

            <Field label="Runs on" required htmlFor="runOn">
              <SelectInput
                id="runOn"
                options={slots.runTargets.map((t) => ({ value: t, label: t }))}
                placeholder="— choose —"
                value={editing.runOn}
                onChange={(e) => setField('runOn', e.target.value)}
              />
            </Field>

            <Field label="Sequence" htmlFor="seqNo" hint="Lower runs first.">
              <NumberInput id="seqNo" value={editing.seqNo} onChange={(e) => setField('seqNo', Number(e.target.value))} />
            </Field>

            <Field label="Debounce (ms)" htmlFor="debounceMs" hint="Field hooks only. Leave blank for none.">
              <NumberInput
                id="debounceMs"
                value={editing.debounceMs ?? ''}
                onChange={(e) => setField('debounceMs', e.target.value === '' ? null : Number(e.target.value))}
              />
            </Field>

            <Field label="Scope" htmlFor="scope">
              <span style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'center', minHeight: '34px' }}>
                <label style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={editing.applyToAllTenants}
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
                  Active
                </label>
              </span>
            </Field>
          </div>

          <Field label="Script" htmlFor="scriptBody">
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              <MonacoScriptEditor value={editing.scriptBody} onChange={(next) => setField('scriptBody', next)} />
            </div>
          </Field>

          <Field label="Sample ctx.form for the test run" htmlFor="sample">
            <TextArea id="sample" rows={5} value={sample} onChange={(e) => setSample(e.target.value)} />
          </Field>

          {test && (
            <Alert tone={test.ok ? 'info' : 'error'}>
              {test.ok ? (
                <>
                  Ran cleanly in {test.durationMs} ms.
                  {test.messages?.length > 0 && <> Messages: {test.messages.join(' | ')}</>}
                  {test.result?.cancelSave && <> The script cancelled the save.</>}
                  {test.result?.message && <> Message: {test.result.message}</>}
                </>
              ) : (
                <>Test failed: {test.error}</>
              )}
            </Alert>
          )}

          {!test && <Alert tone="warn">Save is disabled until a test run has passed.</Alert>}
        </Modal>
      )}

      {history && (
        <Modal title={`Version history — ${history.hook.hookKey}`} onClose={() => setHistory(null)}>
          <Card>
            <DataTable
              caption="Versions"
              columns={[
                { key: 'versionNo', label: 'Version', width: '90px' },
                { key: 'runOn', label: 'Runs on', width: '100px' },
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
