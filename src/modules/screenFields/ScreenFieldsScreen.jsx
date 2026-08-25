import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns3, Database, Eye, KeyRound, ListTree, Lock, Pencil, Plus, Route, Trash2 } from 'lucide-react'
import { NhrScope } from '../../config/nhr/NhrScope.jsx'
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  MetricCard,
  Modal,
  Segmented,
  Select,
  SwitchField,
  Tabs,
  Textarea,
  useToast,
} from '../../config/nhr/ui/index.js'
import { ApiError } from '../../core/api/ApiError.js'
import { BLANK_FIELD, fieldColumnApi, slugColumn } from './fieldColumnApi.js'
import './screenFields.css'

/**
 * The Screen Field Builder that adds real columns.
 *
 * Every field on this page is a column on the screen's own table: adding one runs an ALTER,
 * deleting one archives the values and drops it. That is what the row-based Field Builder
 * trades away, and what makes a configured field reportable like any other.
 *
 * Three things the page has to make obvious, because each is irreversible:
 *   which table is being altered — the chips under the screen picker;
 *   where the column will land — the placement breadcrumb in the editor;
 *   which fields are the product's — the System badge, on rows with no edit or delete.
 */

const WIDTHS = [
  { value: 'half', label: 'Half width' },
  { value: 'full', label: 'Full width' },
]

const PREVIEW_MODES = [
  { value: 'form', label: 'Entry form' },
  { value: 'detail', label: 'Detail view' },
  { value: 'print', label: 'Review & print' },
]

/** What the preview draws for a control, so the author sees the shape rather than a name. */
function PreviewControl({ field }) {
  const common = { disabled: true, placeholder: field.placeholder || `${field.controlType} field` }

  if (field.controlType === 'textarea') return <Textarea rows={2} {...common} />
  if (field.controlType === 'checkbox') return <input type="checkbox" disabled />
  if (['dropdown', 'radio', 'multiselect'].includes(field.controlType)) {
    return (
      <Select
        disabled
        value=""
        options={(field.options ?? []).map((o) => ({ value: o.optionValue, label: o.optionLabel }))}
        placeholder={field.placeholder || 'Select…'}
      />
    )
  }
  return <Input {...common} />
}

export default function ScreenFieldsScreen() {
  const toast = useToast()

  const [screens, setScreens] = useState([])
  const [screenCode, setScreenCode] = useState('')
  const [layout, setLayout] = useState(null)
  const [controlTypes, setControlTypes] = useState([])
  const [reloadToken, setReloadToken] = useState(0)
  const [failure, setFailure] = useState(null)

  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState('form')
  const [editor, setEditor] = useState(null)
  const [editorError, setEditorError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(null)

  useEffect(() => {
    Promise.all([fieldColumnApi.screens(), fieldColumnApi.controlTypes()])
      .then(([screenList, controls]) => {
        setScreens(screenList ?? [])
        setControlTypes(controls ?? [])
        setScreenCode((current) => current || screenList?.[0]?.screenCode || '')
      })
      .catch(setFailure)
  }, [])

  // Switching screens starts at its first step. Reset during render rather than in an effect:
  // React's documented way to key state off a value, and it avoids the extra commit that
  // would briefly show the new screen under the old screen's step.
  const [stepOwner, setStepOwner] = useState(screenCode)
  if (stepOwner !== screenCode) {
    setStepOwner(screenCode)
    setStep(0)
  }

  /*
   * The layout, refetched whenever the screen changes or something edits it.
   *
   * `busy` is derived by comparing the layout in hand against the screen currently chosen,
   * the same way usePagedList does it: a separate flag would need a synchronous setState in
   * the effect, and it would let a stale layout render as though it were the new one.
   */
  useEffect(() => {
    if (!screenCode) return undefined
    let alive = true

    fieldColumnApi
      .layout(screenCode, { fresh: true })
      .then((next) => {
        if (!alive) return
        setLayout(next)
        setFailure(null)
      })
      .catch((cause) => {
        if (alive) setFailure(cause)
      })

    return () => {
      alive = false
    }
  }, [screenCode, reloadToken])

  const reload = () => setReloadToken((token) => token + 1)

  const screen = layout?.screen
  const loading = layout?.screen?.screenCode !== screenCode
  const steps = layout?.steps?.length ? layout.steps : ['Fields']
  const fields = useMemo(() => layout?.fields ?? [], [layout])

  const inStep = useCallback(
    (index) => fields.filter((f) => f.stepIndex === index).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields],
  )

  const stepFields = inStep(step)
  const visible = stepFields.filter((f) =>
    preview === 'form' ? f.showInForm : preview === 'detail' ? f.showInDetail : f.showInPrint,
  )

  // ---------------------------------------------------------------
  // The editor
  // ---------------------------------------------------------------

  function openEditor(field) {
    setEditorError('')
    setEditor(
      field
        ? { mode: 'edit', form: { ...BLANK_FIELD, ...field, maxLength: field.maxLength ?? '' } }
        : {
            mode: 'add',
            // A new field lands at the end of the step being looked at, which is where an
            // author who says nothing about placement expects it.
            form: {
              ...BLANK_FIELD,
              stepIndex: step,
              afterFieldId: stepFields[stepFields.length - 1]?.fieldId ?? 0,
            },
          },
    )
  }

  const set = (patch) => setEditor((current) => ({ ...current, form: { ...current.form, ...patch } }))

  const control = controlTypes.find((c) => c.controlType === editor?.form.controlType)
  const editorSteps = editor ? inStep(editor.form.stepIndex) : []
  const anchorIndex = editorSteps.findIndex((f) => f.fieldId === editor?.form.afterFieldId)

  async function saveField() {
    const form = editor.form
    setBusy(true)
    setEditorError('')
    try {
      await fieldColumnApi.saveField(screenCode, {
        ...form,
        columnName: form.fieldId ? form.columnName : form.columnName || slugColumn(form.label),
        maxLength: form.maxLength === '' ? null : Number(form.maxLength),
        options: control?.hasOptions ? form.options.filter((o) => String(o.optionValue ?? '').trim() !== '') : [],
        dataSourceType: control?.hasOptions ? 'Static' : 'None',
      })
      toast.success(form.fieldId ? 'Field updated' : 'Field and column created')
      setEditor(null)
      reload()
    } catch (cause) {
      setEditorError(cause instanceof ApiError ? cause.message : 'The field could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteField(field) {
    try {
      await fieldColumnApi.deleteField(screenCode, field.fieldId, field.columnName)
      toast.success(`${field.label} removed`, `Values archived, ${field.columnName} dropped`)
      reload()
    } catch (cause) {
      toast.error('Could not remove the field', cause?.message)
    } finally {
      setConfirming(null)
    }
  }

  if (failure && screens.length === 0) {
    return (
      <NhrScope>
        <EmptyState icon={<Columns3 size={26} />} title="Screen fields unavailable" desc={failure.message} />
      </NhrScope>
    )
  }

  return (
    <NhrScope>
      <div className="sf-metrics">
        <MetricCard label="Configurable screens" value={String(screens.length)} tint="lavender" icon={<Columns3 size={19} />} />
        <MetricCard
          label="Fields on this screen"
          value={String(fields.length)}
          tint="blue"
          icon={<ListTree size={19} />}
          footer={screen ? `across ${steps.length} step(s)` : ' '}
        />
        <MetricCard
          label="Columns added here"
          value={String(fields.filter((f) => f.isCustom).length)}
          tint="mint"
          icon={<Database size={19} />}
          footer={screen ? `on ${screen.baseTable}` : ' '}
        />
      </div>

      <div className="card card-pad sf-picker">
        <Field label="Screen" help="Only screens registered for field configuration are listed">
          <Select
            value={screenCode}
            onChange={(e) => setScreenCode(e.target.value)}
            options={screens.map((s) => ({ value: s.screenCode, label: s.screenName }))}
          />
        </Field>

        {screen && (
          <div className="sf-chips">
            <span className="sf-chip"><Database size={13} /> {screen.baseTable}</span>
            <span className="sf-chip"><KeyRound size={13} /> PK: {screen.pkColumn}</span>
            {screen.routePath && <span className="sf-chip"><Route size={13} /> {screen.routePath}</span>}
          </div>
        )}
      </div>

      {steps.length > 1 && (
        <Tabs
          tabs={steps.map((label, index) => ({ key: String(index), label, count: inStep(index).length }))}
          active={String(step)}
          onChange={(key) => setStep(Number(key))}
        />
      )}

      <div className="sf-split">
        <section className="card card-pad">
          <header className="sf-head">
            <div>
              <h3><ListTree size={16} /> Form structure</h3>
              <p className="sf-sub">
                {steps[step]} · {stepFields.length} field(s) — top to bottom is the order on the screen
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openEditor(null)} disabled={!screen}>
              <Plus size={15} /> Add field
            </button>
          </header>

          {loading && <p className="sf-sub">Loading…</p>}

          {!loading && stepFields.length === 0 && (
            <EmptyState icon={<ListTree size={22} />} title="No fields in this step" desc="Add one — it becomes a column." />
          )}

          <ol className="sf-list">
            {stepFields.map((field, index) => (
              <li key={field.fieldId} className="sf-row">
                <span className="sf-seq">{index + 1}</span>
                <div className="sf-row__text">
                  <strong>
                    {field.label}
                    {field.isRequired && <span className="sf-req">*</span>}
                  </strong>
                  <span className="sf-meta">
                    <code>{field.columnName}</code>
                    <Badge tone="neutral">{field.controlType}</Badge>
                    {field.isCustom ? (
                      <Badge tone="violet">Custom</Badge>
                    ) : (
                      <Badge tone="amber"><Lock size={11} /> System</Badge>
                    )}
                  </span>
                </div>
                <span className="sf-row__actions">
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={field.isCustom ? 'Edit' : 'Columns the product ships cannot be edited here'}
                    disabled={!field.isCustom}
                    onClick={() => openEditor(field)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={field.isCustom ? 'Remove field and column' : 'Columns the product ships cannot be dropped here'}
                    disabled={!field.isCustom}
                    onClick={() => setConfirming(field)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card card-pad">
          <header className="sf-head">
            <div>
              <h3><Eye size={16} /> Live preview</h3>
              <p className="sf-sub">
                {screen?.screenName} · {steps[step]}{screen?.routePath ? ` · ${screen.routePath}` : ''}
              </p>
            </div>
            <Segmented options={PREVIEW_MODES} value={preview} onChange={setPreview} size="sm" />
          </header>

          <div className="sf-preview">
            {visible.length === 0 && <p className="sf-sub">Nothing appears here in this mode.</p>}
            {visible.map((field) => (
              <div key={field.fieldId} className={field.width === 'full' ? 'sf-pv sf-pv--full' : 'sf-pv'}>
                <span className="sf-pv__tag">{field.isCustom ? 'CUSTOM' : 'SYSTEM'}</span>
                <Field label={field.label} required={field.isRequired} help={field.helpText || undefined}>
                  <PreviewControl field={field} />
                </Field>
              </div>
            ))}
          </div>
        </section>
      </div>

      {editor && (
        <Modal
          open
          size="lg"
          onClose={() => setEditor(null)}
          title={editor.mode === 'add' ? 'Add field' : `Edit ${editor.form.label}`}
          subtitle={
            editor.mode === 'add'
              ? `Inserted ${anchorIndex >= 0 ? `after "${editorSteps[anchorIndex].label}"` : 'at the top'} — a new column is created on ${screen?.baseTable}`
              : `${editor.form.columnName} on ${screen?.baseTable} — the column is altered, never recreated`
          }
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={saveField}>
                {busy ? 'Saving…' : editor.mode === 'add' ? 'Create field & column' : 'Save field'}
              </button>
            </>
          }
        >
          {editorError && <div className="alert alert-danger mb-3">{editorError}</div>}

          {/* Where it lands, spelled out. A sequence number would say the same thing and mean
              nothing to the person choosing it. */}
          <div className="sf-placement">
            <span className="sf-placement__label">Placement in {steps[editor.form.stepIndex] ?? 'this step'}</span>
            <div className="sf-placement__path">
              {editorSteps.map((f, index) => (
                <span key={f.fieldId} className={index === anchorIndex ? 'sf-crumb sf-crumb--anchor' : 'sf-crumb'}>
                  {f.label}
                </span>
              ))}
              <span className="sf-crumb sf-crumb--new">{editor.form.label || 'New field'}</span>
            </div>
          </div>

          <div className="form-grid">
            <Field label="Label" required>
              <Input
                value={editor.form.label}
                maxLength={160}
                autoFocus
                placeholder="e.g. Cost Centre"
                onChange={(e) => set({ label: e.target.value })}
              />
            </Field>

            <Field
              label="Column name"
              required
              help={editor.form.fieldId ? 'Fixed once the column exists.' : 'Left blank, it is derived from the label.'}
            >
              <Input
                value={editor.form.columnName}
                maxLength={61}
                disabled={Boolean(editor.form.fieldId)}
                placeholder={slugColumn(editor.form.label)}
                onChange={(e) => set({ columnName: e.target.value })}
              />
            </Field>

            <Field label="Control type" required help={control ? `Stored as ${control.sqlType}` : undefined}>
              <Select
                value={editor.form.controlType}
                onChange={(e) => set({ controlType: e.target.value })}
                options={controlTypes.map((c) => ({ value: c.controlType, label: `${c.label} — ${c.sqlType}` }))}
              />
            </Field>

            <Field label="Step">
              <Select
                value={String(editor.form.stepIndex)}
                onChange={(e) => {
                  const stepIndex = Number(e.target.value)
                  const list = inStep(stepIndex)
                  set({ stepIndex, afterFieldId: list[list.length - 1]?.fieldId ?? 0 })
                }}
                options={steps.map((label, index) => ({ value: String(index), label }))}
              />
            </Field>

            <Field label="Add after" help="Which field the new one follows — defaults to the end of the step">
              <Select
                value={String(editor.form.afterFieldId)}
                onChange={(e) => set({ afterFieldId: Number(e.target.value) })}
                options={[
                  { value: '0', label: 'At the top' },
                  ...editorSteps.map((f, index) => ({
                    value: String(f.fieldId),
                    label: index === editorSteps.length - 1 ? `After ${f.label} (last)` : `After ${f.label}`,
                  })),
                ]}
              />
            </Field>

            <Field label="Width">
              <Select value={editor.form.width} onChange={(e) => set({ width: e.target.value })} options={WIDTHS} />
            </Field>

            <Field label="Placeholder">
              <Input value={editor.form.placeholder ?? ''} maxLength={160} onChange={(e) => set({ placeholder: e.target.value })} />
            </Field>

            <Field label="Default value">
              <Input value={editor.form.defaultValue ?? ''} maxLength={255} onChange={(e) => set({ defaultValue: e.target.value })} />
            </Field>

            <SwitchField
              label="Required"
              desc="Checked before the record is saved"
              checked={Boolean(editor.form.isRequired)}
              onChange={(value) => set({ isRequired: value })}
            />

            {control?.isNumeric && (
              <>
                <Field label="Minimum">
                  <Input type="number" value={editor.form.rangeMin ?? ''} onChange={(e) => set({ rangeMin: e.target.value })} />
                </Field>
                <Field label="Maximum">
                  <Input type="number" value={editor.form.rangeMax ?? ''} onChange={(e) => set({ rangeMax: e.target.value })} />
                </Field>
              </>
            )}

            {!control?.isNumeric && !control?.hasOptions && (
              <Field label="Max length" help="Narrows the column — text only">
                <Input
                  type="number"
                  min={1}
                  value={editor.form.maxLength ?? ''}
                  onChange={(e) => set({ maxLength: e.target.value })}
                />
              </Field>
            )}

            <div className="span-3">
              <Field label="Help text">
                <Input value={editor.form.helpText ?? ''} maxLength={300} onChange={(e) => set({ helpText: e.target.value })} />
              </Field>
            </div>

            <div className="span-3">
              <Field label="Where it appears" help="The column holds the value either way; these decide what renders it.">
                <div className="sf-visibility">
                  <SwitchField label="Entry form" checked={editor.form.showInForm} onChange={(v) => set({ showInForm: v })} />
                  <SwitchField label="Detail view" checked={editor.form.showInDetail} onChange={(v) => set({ showInDetail: v })} />
                  <SwitchField label="Review & print" checked={editor.form.showInPrint} onChange={(v) => set({ showInPrint: v })} />
                </div>
              </Field>
            </div>

            {control?.hasOptions && (
              <div className="span-3">
                <Field label="Choices" help="One per line. The value is stored; the label is shown.">
                  <Textarea
                    rows={4}
                    value={(editor.form.options ?? []).map((o) => o.optionLabel || o.optionValue).join('\n')}
                    placeholder={'Central Hospital\nNorth Wing'}
                    onChange={(e) =>
                      set({
                        options: e.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line) => ({ optionValue: line, optionLabel: line })),
                      })
                    }
                  />
                </Field>
              </div>
            )}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        danger
        title={confirming ? `Remove ${confirming.label}?` : ''}
        desc={
          confirming
            ? `Every value in ${confirming.columnName} is copied to the archive, then the column is dropped from ${screen?.baseTable}. The column cannot be brought back.`
            : ''
        }
        confirmText="Archive and drop"
        onClose={() => setConfirming(null)}
        onConfirm={() => deleteField(confirming)}
      />
    </NhrScope>
  )
}
