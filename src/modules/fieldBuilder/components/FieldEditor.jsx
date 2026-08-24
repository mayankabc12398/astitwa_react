import { useState } from 'react'
import { AlertCircle, Calculator, Check, Sigma, Sparkles, Zap } from 'lucide-react'
import { Badge, Field, Input, Modal, Select, SwitchField, Tabs, Textarea } from '../../../config/nhr/ui/index.js'
import { OptionEditor } from './OptionEditor.jsx'
import { SourceBinder } from './SourceBinder.jsx'
import { BLANK_BINDING, DATA_SOURCES, LOOKUPS, RECALC_MODES, WIDTHS } from './fieldModel.js'
import { AT_TOP, NEW_SECTION, currentAnchor, fieldsInSection, seqAfter, sectionOptions } from './placement.js'
import { fieldBuilderApi } from '../fieldBuilderApi.js'

/**
 * Add or edit one tenant-defined field.
 *
 * Three tabs, because the three decisions are independent: what the field IS, where its
 * choices come from, and whether its value is typed or derived. Putting them on one long
 * form made the common case — a plain text field — look far harder than it is.
 *
 * The field key is shown but fixed after creation: a print template and a stored script both
 * reference a field by name, and renaming it would break them with no error anywhere. The
 * server refuses the change too; this only stops somebody trying.
 */
export function FieldEditor({
  mode,
  field,
  screenKey,
  controlTypes,
  dataSources,
  siblings,
  anchors,
  sections = [],
  compiledFields = [],
  busy = false,
  message,
  errors = {},
  onChange,
  onSave,
  onClose,
}) {
  const [tab, setTab] = useState('basics')
  const [test, setTest] = useState(null)
  const [testing, setTesting] = useState(false)

  /*
   * Placement.
   *
   * The section and the field it follows are the two things an author actually knows; the
   * sequence number is derived from them and never typed. Both are held as local state
   * because they are questions about the form, not columns on the field — what gets saved is
   * sectionKey and the seqNo they produce.
   */
  const sectionChoices = sectionOptions(sections, siblings)
  const [namingSection, setNamingSection] = useState(
    Boolean(field.sectionKey) && !sectionChoices.some((c) => c.value === field.sectionKey),
  )

  const ordered = fieldsInSection(field.sectionKey, compiledFields, siblings, field.fieldId)
  const [after, setAfter] = useState(() => currentAnchor(ordered, field.seqNo ?? 1000))

  /** Moves the field, and takes the sequence number that puts it there. */
  const placeAfter = (anchor, list = ordered) => {
    setAfter(anchor)
    set({ seqNo: seqAfter(list, anchor) })
  }

  /** A new section starts empty, so the field lands at the top of it either way. */
  const chooseSection = (value) => {
    if (value === NEW_SECTION) {
      setNamingSection(true)
      setAfter(AT_TOP)
      onChange({ ...field, sectionKey: '', seqNo: 1000 })
      return
    }

    setNamingSection(false)
    const list = fieldsInSection(value, compiledFields, siblings, field.fieldId)
    const last = list.length > 0 ? list[list.length - 1].fieldKey : AT_TOP
    setAfter(last)
    onChange({ ...field, sectionKey: value, seqNo: seqAfter(list, last) })
  }

  const set = (patch) => onChange({ ...field, ...patch })

  const control = controlTypes.find((c) => c.controlType === field.controlType)
  const hasOptions = Boolean(control?.hasOptions)
  const isNumeric = Boolean(control?.isNumeric)
  const isNew = !field.fieldId

  // A field cannot cascade from itself, and only a field that already exists can be a parent.
  const parents = siblings
    .filter((s) => s.fieldId !== field.fieldId && s.dataSourceType !== 'None')
    .map((s) => ({ value: s.fieldKey, label: s.label }))

  // Everything a formula may read: the compiled anchors plus the tenant's own fields.
  const referenceable = [
    ...anchors.map((k) => ({ key: k, label: k, kind: 'Compiled' })),
    ...siblings.filter((s) => s.fieldId !== field.fieldId).map((s) => ({ key: s.fieldKey, label: s.label, kind: 'Custom' })),
  ]

  async function runTest() {
    setTesting(true)
    try {
      // Sample values let the author see a number rather than a parse verdict. Every
      // reference gets one, so a formula is exercised end to end rather than half-checked.
      const sampleValues = {}
      for (const r of referenceable) sampleValues[r.key] = '100'

      const result = await fieldBuilderApi.testFormula({
        screenKey,
        fieldKey: field.fieldKey || null,
        formulaText: field.formulaText || '',
        roundTo: field.roundTo === '' ? null : Number(field.roundTo),
        sampleValues,
      })
      setTest(result)
    } catch (cause) {
      setTest({ isValid: false, error: cause?.message ?? 'The formula could not be checked.' })
    } finally {
      setTesting(false)
    }
  }

  /** Inserts {key} at the end of the formula — quicker and less error-prone than typing it. */
  const insertRef = (key) => set({ formulaText: `${field.formulaText || ''}{${key}}` })

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={mode === 'add' ? 'Add field' : `Edit ${field.label || 'field'}`}
      subtitle={
        mode === 'add'
          ? 'The field becomes a row, and its values become rows against each record — no table is altered.'
          : `Key ${field.fieldKey} is fixed; templates and scripts reference it by name.`
      }
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => onSave(field)}>
            {busy ? 'Saving…' : 'Save field'}
          </button>
        </>
      }
    >
      {message && (
        <div className="alert alert-danger mb-3">
          <AlertCircle size={15} /> {message}
        </div>
      )}

      <Tabs
        tabs={[
          { key: 'basics', label: 'The field' },
          ...(hasOptions ? [{ key: 'choices', label: 'Choices' }] : []),
          ...(isNumeric ? [{ key: 'calc', label: 'Calculation' }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'basics' && (
        <div className="form-grid mt-3">
          <Field label="Label" required error={errors.label}>
            <Input value={field.label} maxLength={160} onChange={(e) => set({ label: e.target.value })} />
          </Field>

          <Field
            label="Field key"
            help={isNew ? 'Left blank, it is derived from the label.' : 'Fixed once the field exists.'}
            error={errors.fieldKey}
          >
            <Input
              value={field.fieldKey}
              maxLength={80}
              disabled={!isNew}
              placeholder="from the label"
              onChange={(e) => set({ fieldKey: e.target.value })}
            />
          </Field>

          <Field label="Control" required error={errors.controlType}>
            <Select
              options={controlTypes.map((c) => ({ value: c.controlType, label: c.label }))}
              value={field.controlType}
              onChange={(e) => set({ controlType: e.target.value })}
            />
          </Field>

          <Field label="Width">
            <Select options={WIDTHS} value={field.width} onChange={(e) => set({ width: e.target.value })} />
          </Field>

          <Field
            label="Section"
            help={namingSection ? 'The form draws a card of its own for it.' : 'The card this field is drawn inside.'}
          >
            <Select
              options={[
                { value: '', label: '— none —' },
                ...sectionChoices,
                { value: NEW_SECTION, label: '+ New section…' },
              ]}
              value={namingSection ? NEW_SECTION : (field.sectionKey ?? '')}
              onChange={(e) => chooseSection(e.target.value)}
            />
          </Field>

          {namingSection && (
            <Field label="New section name" help="Fields added to it later can pick it from the list.">
              <Input
                value={field.sectionKey ?? ''}
                maxLength={80}
                autoFocus
                placeholder="e.g. Consent"
                onChange={(e) => set({ sectionKey: e.target.value })}
              />
            </Field>
          )}

          <Field
            label="Place after"
            help={`Renders at position ${field.seqNo ?? 1000}${ordered.length === 0 ? ' — first in this section' : ''}`}
          >
            <Select
              options={[
                { value: AT_TOP, label: 'At the top' },
                ...ordered.map((f) => ({
                  value: f.fieldKey,
                  label: f.isCustom ? `${f.label} (added)` : f.label,
                })),
              ]}
              value={after}
              onChange={(e) => placeAfter(e.target.value)}
            />
          </Field>

          <Field label="Placeholder">
            <Input value={field.placeholder ?? ''} maxLength={160} onChange={(e) => set({ placeholder: e.target.value })} />
          </Field>

          <Field label="Default value">
            <Input value={field.defaultValue ?? ''} maxLength={255} onChange={(e) => set({ defaultValue: e.target.value })} />
          </Field>

          <SwitchField
            label="Required"
            desc="Checked before the record is saved"
            checked={Boolean(field.isRequired)}
            onChange={(v) => set({ isRequired: v })}
          />

          {isNumeric && (
            <>
              <Field label="Minimum" error={errors.rangeMin}>
                <Input type="number" value={field.rangeMin ?? ''} onChange={(e) => set({ rangeMin: e.target.value })} />
              </Field>
              <Field label="Maximum" error={errors.rangeMax}>
                <Input type="number" value={field.rangeMax ?? ''} onChange={(e) => set({ rangeMax: e.target.value })} />
              </Field>
            </>
          )}

          {!isNumeric && !hasOptions && (
            <Field label="Maximum length">
              <Input type="number" min={1} value={field.maxLength ?? ''} onChange={(e) => set({ maxLength: e.target.value })} />
            </Field>
          )}

          <Field label="Pattern" help="A regular expression the value has to match. Optional." error={errors.regexPattern}>
            <Input value={field.regexPattern ?? ''} maxLength={300} onChange={(e) => set({ regexPattern: e.target.value })} />
          </Field>

          <div className="span-3">
            <Field label="Help text">
              <Textarea rows={2} value={field.helpText ?? ''} maxLength={300} onChange={(e) => set({ helpText: e.target.value })} />
            </Field>
          </div>

          <div className="span-3">
          <Field label="Where it appears" help="The value is stored either way; these only decide what renders it.">
            <div className="flex items-center gap-4 flex-wrap">
              {[
                ['showInForm', 'Form'],
                ['showInDetail', 'Detail'],
                ['showInPrint', 'Print'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 t-sm">
                  <input type="checkbox" checked={field[key] !== false} onChange={(e) => set({ [key]: e.target.checked })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </Field>
          </div>
        </div>
      )}

      {tab === 'choices' && hasOptions && (
        <div className="mt-3">
          <Field label="Where the choices come from" error={errors.dataSourceType}>
            <Select
              options={DATA_SOURCES}
              placeholder="— choose —"
              value={field.dataSourceType === 'None' ? '' : field.dataSourceType}
              onChange={(e) => {
                const next = e.target.value || 'None'
                set({
                  dataSourceType: next,
                  binding: next === 'Dynamic' ? (field.binding ?? { ...BLANK_BINDING }) : null,
                })
              }}
            />
          </Field>

          {field.dataSourceType === 'Lookup' && (
            <Field label="Which list" error={errors.lookupKey}>
              <Select
                options={LOOKUPS}
                value={field.lookupKey ?? ''}
                onChange={(e) => set({ lookupKey: e.target.value })}
              />
            </Field>
          )}

          {field.dataSourceType === 'Static' && (
            <>
              {parents.length > 0 && (
                <Field label="Filtered by" help="Pick a field whose value narrows this list. Optional.">
                  <Select
                    options={parents}
                    placeholder="— nothing —"
                    value={field.parentFieldKey ?? ''}
                    onChange={(e) => set({ parentFieldKey: e.target.value })}
                  />
                </Field>
              )}

              {errors.options && (
                <div className="alert alert-danger mb-3">
                  <AlertCircle size={15} /> {errors.options}
                </div>
              )}

              <OptionEditor
                options={field.options ?? []}
                cascading={Boolean(field.parentFieldKey)}
                onChange={(options) => set({ options })}
              />
            </>
          )}

          {field.dataSourceType === 'Dynamic' && (
            <SourceBinder
              binding={field.binding ?? { ...BLANK_BINDING }}
              dataSources={dataSources}
              parents={parents}
              error={errors.binding}
              onChange={(binding) => set({ binding })}
            />
          )}
        </div>
      )}

      {tab === 'calc' && isNumeric && (
        <div className="mt-3">
          <Field label="How the value is set">
            <Select
              options={[
                { value: 'Manual', label: 'Typed in' },
                { value: 'Computed', label: 'Calculated from other fields' },
              ]}
              value={field.valueMode}
              onChange={(e) => set({ valueMode: e.target.value })}
            />
          </Field>

          {field.valueMode === 'Computed' && (
            <>
              <Field
                label="Formula"
                required
                error={errors.formulaText}
                help="Reference a field as {fieldKey}. Operators + - * / and comparisons; MIN, MAX, ROUND and IF."
              >
                <Textarea
                  rows={3}
                  className="mono"
                  value={field.formulaText ?? ''}
                  placeholder="{basicPay} * 0.10"
                  onChange={(e) => {
                    setTest(null)
                    set({ formulaText: e.target.value })
                  }}
                />
              </Field>

              <div className="fb-strip mb-3">
                <span className="t-xs ink-3">Insert a field:</span>
                {referenceable.map((r) => (
                  <button key={r.key} type="button" className="fb-chip is-ref" onClick={() => insertRef(r.key)} title={r.kind}>
                    {r.label}
                  </button>
                ))}
                {referenceable.length === 0 && <span className="t-xs ink-3">This screen has no other fields yet.</span>}
              </div>

              <div className="form-grid">
                <Field label="Round to" help="Decimal places. Blank leaves the result alone." error={errors.roundTo}>
                  <Input
                    type="number"
                    min={0}
                    max={6}
                    value={field.roundTo ?? ''}
                    onChange={(e) => set({ roundTo: e.target.value })}
                  />
                </Field>

                <Field label="When it recalculates">
                  <Select
                    options={RECALC_MODES}
                    value={field.recalcMode ?? 'Always'}
                    onChange={(e) => set({ recalcMode: e.target.value })}
                  />
                </Field>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <button className="btn btn-ghost btn-sm" onClick={runTest} disabled={testing || !field.formulaText}>
                  <Calculator size={14} /> {testing ? 'Checking…' : 'Check the formula'}
                </button>
                <span className="t-xs ink-3">Every referenced field is given a sample value of 100.</span>
              </div>

              {test && (
                <div className={`alert ${test.isValid ? 'alert-success' : 'alert-danger'}`}>
                  {test.isValid ? (
                    <>
                      <Check size={15} />
                      <div>
                        <div>
                          Result <strong>{String(test.value)}</strong>
                        </div>
                        {test.readable && <div className="t-xs ink-3">{test.readable}</div>}
                        {test.missing?.length > 0 && (
                          <div className="t-xs ink-3">Counted as zero: {test.missing.join(', ')}</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={15} /> {test.error}
                    </>
                  )}
                </div>
              )}

              <div className="fb-note">
                <Sigma size={14} />
                <span>
                  The browser evaluates this as the form is typed into, and the server evaluates it again on save.
                  What the server works out is what gets stored, so what is on screen is what gets kept.
                </span>
              </div>
            </>
          )}

          {field.valueMode !== 'Computed' && (
            <div className="fb-note">
              <Sparkles size={14} />
              <span>A calculated field derives its value from other fields on this screen, so nobody has to type it.</span>
            </div>
          )}
        </div>
      )}

      {field.dataSourceType === 'Dynamic' && tab !== 'choices' && (
        <div className="fb-note mt-3">
          <Zap size={14} />
          <span>
            This list reads from <Badge tone="info">{field.binding?.sourceCode || 'a data source'}</Badge>
          </span>
        </div>
      )}
    </Modal>
  )
}
