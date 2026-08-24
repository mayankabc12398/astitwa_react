import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, Database, Eye, GitBranch, GripVertical, History, Layers,
  ListChecks, Lock, MapPin, Pencil, Plus, RefreshCw, ShieldCheck, Sigma, Table2, Trash2, Zap,
} from 'lucide-react'
import { ApiError } from '../../core/api/ApiError.js'
import { useUi } from '../../core/controls/uiContext.js'
import { NhrScope } from '../../config/nhr/NhrScope.jsx'
import {
  Accordion, Badge, EmptyState, MetricCard, PageHeader, Segmented, SkeletonRows, useToast,
} from '../../config/nhr/ui/index.js'
import { CustomFieldControl } from '../../config/customFields/CustomFieldControl.jsx'
import { invalidateCustomFields } from '../../config/customFields/useCustomFields.js'
import { evaluateFormula } from '../../config/customFields/formula.js'
import { fieldBuilderApi } from './fieldBuilderApi.js'
import { FieldEditor } from './components/FieldEditor.jsx'
import { BLANK_FIELD } from './components/fieldModel.js'
import './fieldBuilder.css'

/** Which surfaces of a screen a field can be switched on for. */
const SURFACES = [
  { key: 'showInForm', label: 'Form' },
  { key: 'showInDetail', label: 'Detail' },
  { key: 'showInPrint', label: 'Print' },
]

const SURFACE_TABS = [
  { value: 'form', label: 'Form' },
  { value: 'detail', label: 'Detail' },
  { value: 'print', label: 'Print' },
]

const SURFACE_KEY = { form: 'showInForm', detail: 'showInDetail', print: 'showInPrint' }

/** One shared empty array, so "no fields yet" keeps a stable identity between renders. */
const EMPTY_FIELDS = []

/**
 * New sequence numbers for a reordered list, section by section.
 *
 * Numbering the whole list 1000, 1010, 1020… is what it used to do, and that is correct only
 * while every custom field lives after every compiled one. A field placed between two
 * compiled fields — which the editor now lets an author do — would be thrown to the bottom of
 * the form the first time anything was dragged.
 *
 * So a section that has compiled fields keeps the positions its custom fields already hold
 * and hands them out in the new order: the field moves, the slot it moves into is one the
 * author already chose. A section of the tenant's own has no such constraint and is numbered
 * from a base of its own, well clear of the compiled ranges.
 */
function renumberBySection(custom, compiledFields = []) {
  const groups = new Map()
  for (const field of custom) {
    const key = (field.sectionKey ?? '').trim()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(field)
  }

  const seqByField = new Map()
  let ownSection = 0

  for (const [key, group] of groups) {
    const compiled = compiledFields.some((c) => (c.sectionKey ?? '') === key)

    if (compiled) {
      const slots = group.map((f) => f.seqNo ?? 1000).sort((a, b) => a - b)
      group.forEach((f, i) => seqByField.set(f.fieldId, slots[i]))
    } else {
      const base = 1000 + ownSection * 100
      ownSection += 1
      group.forEach((f, i) => seqByField.set(f.fieldId, base + i * 10))
    }
  }

  return custom.map((f) => ({ ...f, seqNo: seqByField.get(f.fieldId) ?? f.seqNo }))
}

function SurfaceBadges({ field }) {
  return (
    <>
      {SURFACES.filter((s) => field[s.key] !== false).map((s) => (
        <Badge key={s.key} tone="neutral">
          {s.label}
        </Badge>
      ))}
    </>
  )
}

/**
 * A compiled field, drawn as it appears on the real screen but inert.
 *
 * The builder cannot render the actual control — that lives in the screen's own component —
 * so this is a stand-in whose only job is to hold the position, which is what an author is
 * really looking at when they decide where a new field goes.
 */
function SystemControlPreview({ fieldKey }) {
  return <input className="input" readOnly tabIndex={-1} value="" placeholder={fieldKey} />
}

/**
 * The Screen Field Builder.
 *
 * A two-pane workspace: the left pane is the structure — order, position, actions — and the
 * right pane is a live preview of the screen with the compiled fields shown as read-only
 * anchors, so the effect of adding or moving a field is visible before it is saved.
 *
 * Unlike the reference implementation this creates no columns. Every tenant here shares
 * hr_employee, so a column added for one would appear on every other tenant's records; the
 * definition and its values are rows instead. Everything above that — ordering, anchors,
 * calculated fields, bound lists, the audit trail — behaves the same.
 */
export default function FieldBuilderScreen() {
  const ui = useUi()
  const toast = useToast()

  const [screens, setScreens] = useState([])
  const [controlTypes, setControlTypes] = useState([])
  const [dataSources, setDataSources] = useState([])
  const [screenKey, setScreenKey] = useState('')

  const [fieldFetch, setFieldFetch] = useState(null)
  const [audit, setAudit] = useState([])
  const [booting, setBooting] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [failure, setFailure] = useState(null)

  const [pane, setPane] = useState('structure')
  const [surface, setSurface] = useState('form')
  const [previewValues, setPreviewValues] = useState({})

  const [editor, setEditor] = useState(null)
  const [editorErrors, setEditorErrors] = useState({})
  const [editorMessage, setEditorMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([fieldBuilderApi.screens(), fieldBuilderApi.controlTypes(), fieldBuilderApi.dataSources()])
      .then(([screenRows, typeRows, sourceRows]) => {
        if (cancelled) return
        setScreens(screenRows ?? [])
        setControlTypes(typeRows ?? [])
        setDataSources(sourceRows ?? [])
        setScreenKey((current) => current || screenRows?.[0]?.screenKey || '')
        setBooting(false)
      })
      .catch((cause) => {
        if (cancelled) return
        setFailure(cause)
        setBooting(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadLayout = useCallback((key) => {
    if (!key) return

    Promise.all([fieldBuilderApi.fields(key), fieldBuilderApi.audit(key)])
      .then(([rows, auditPage]) => {
        setFieldFetch({ screenKey: key, fields: rows ?? [] })
        setAudit(auditPage?.items ?? [])
        setReloading(false)
      })
      .catch((cause) => {
        setFailure(cause)
        setReloading(false)
      })
  }, [])

  useEffect(() => {
    loadLayout(screenKey)
  }, [screenKey, loadLayout])

  // Derived rather than cleared in the effect: what was fetched is stored with the screen it
  // belongs to, so switching screens shows an empty list at once instead of the previous
  // screen's fields until the new ones land.
  // Memoised because the empty case is a fresh array literal, which would otherwise give
  // every dependent memo a new identity on every render.
  const fields = useMemo(
    () => (fieldFetch?.screenKey === screenKey ? fieldFetch.fields : EMPTY_FIELDS),
    [fieldFetch, screenKey],
  )

  const loading = booting || (Boolean(screenKey) && fieldFetch?.screenKey !== screenKey)

  const screen = screens.find((s) => s.screenKey === screenKey)
  const anchors = useMemo(() => screen?.compiledFieldKeys ?? [], [screen])

  // What the screen declares about its own shape: the bands it draws, and where each
  // compiled field sits inside them. Both drive the placement choices in the editor.
  const sections = useMemo(() => screen?.sections ?? [], [screen])
  const compiledFields = useMemo(() => screen?.compiledFields ?? [], [screen])

  /**
   * The structure list: the compiled anchors first, then the tenant's own fields in their
   * configured order. Custom sequence numbers start above the compiled ones, so this is the
   * order the form actually renders in.
   */
  const rows = useMemo(
    () => [
      ...anchors.map((key) => ({ fieldKey: key, label: key, isCustom: false, controlType: 'text' })),
      ...fields.map((f) => ({ ...f, isCustom: true })),
    ],
    [anchors, fields],
  )

  const customCount = fields.length

  // Which row is being dragged, which row it is over, and which side of it. null id means
  // nothing is being dragged, which is what every handler below checks first.
  const [drag, setDrag] = useState({ id: null, overId: null, edge: null })

  // A draft is folded into the preview so an author sees the field they are describing
  // before it exists. It is marked, because a preview that cannot be told from the saved
  // layout would be a preview nobody can trust.
  const previewRows = useMemo(() => {
    if (!editor) return rows

    const draft = {
      ...editor.form,
      fieldKey: editor.form.fieldKey || 'draft',
      isCustom: true,
      __draft: true,
      __isNew: !editor.form.fieldId,
    }

    return editor.form.fieldId
      ? rows.map((r) => (r.fieldId === editor.form.fieldId ? { ...r, ...draft } : r))
      : [...rows, draft]
  }, [rows, editor])

  if (failure && screens.length === 0) {
    return (
      <NhrScope>
        <EmptyState icon={<Table2 size={26} />} title="Field builder unavailable" desc={failure.message} />
      </NhrScope>
    )
  }

  function openEditor(field) {
    setEditorErrors({})
    setEditorMessage('')
    setEditor({
      mode: field ? 'edit' : 'add',
      form: field
        ? { ...BLANK_FIELD, ...field, maxLength: field.maxLength ?? '', roundTo: field.roundTo ?? '' }
        : { ...BLANK_FIELD, screenKey, seqNo: 1000 + fields.length * 10, sectionKey: '' },
    })
  }

  async function onSave(form) {
    setBusy(true)
    setEditorErrors({})
    setEditorMessage('')

    try {
      await fieldBuilderApi.save({
        ...form,
        screenKey,
        maxLength: form.maxLength === '' ? null : Number(form.maxLength),
        roundTo: form.roundTo === '' ? null : Number(form.roundTo),
        seqNo: Number(form.seqNo) || 1000,
        options: (form.options ?? []).filter((o) => String(o.optionValue ?? '').trim() !== ''),
        binding: form.dataSourceType === 'Dynamic' ? form.binding : null,
      })

      // Forms cache the definitions per screen, so a change here has to invalidate that or
      // an already-open employee form would keep rendering yesterday's layout.
      invalidateCustomFields(screenKey)
      setReloading(true)
      loadLayout(screenKey)
      setEditor(null)
      toast.success('Field saved')
    } catch (cause) {
      if (cause instanceof ApiError) {
        setEditorErrors(cause.fieldErrors)
        setEditorMessage(cause.message)
      } else {
        setEditorMessage('The field could not be saved.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function askDelete(field) {
    let filled = 0
    try {
      filled = (await fieldBuilderApi.usage(field.fieldId))?.filledCount ?? 0
    } catch {
      // The count is context for the decision, not a precondition for it.
      filled = 0
    }

    const confirmed = await ui.confirm({
      title: `Remove ${field.label}?`,
      message:
        filled > 0
          ? `${filled} record${filled === 1 ? '' : 's'} hold a value for this field. Every value is copied to the archive first, and the field stops appearing on the screen.`
          : 'The field stops appearing on the screen. Nothing else changes.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!confirmed) return

    try {
      await fieldBuilderApi.remove(field.fieldId)
      invalidateCustomFields(screenKey)
      setReloading(true)
      loadLayout(screenKey)
      toast.success('Field removed', filled > 0 ? `${filled} value(s) archived` : undefined)
    } catch (cause) {
      toast.error('Could not remove the field', cause?.message)
    }
  }

  /**
   * Writes an order back.
   *
   * Shared by the arrows and by dragging, so the two cannot drift apart — and so a screen
   * reordered either way renumbers by the same rule.
   */
  async function persistOrder(custom) {
    // The order is re-derived from the array rather than nudging one number, so a list that
    // has drifted out of step repairs itself the first time anything is moved.
    const renumbered = renumberBySection(custom, compiledFields)
    setFieldFetch({ screenKey, fields: renumbered })

    try {
      await fieldBuilderApi.reorder(
        renumbered.map((f) => ({ fieldId: f.fieldId, seqNo: f.seqNo, sectionKey: f.sectionKey ?? null })),
      )
      invalidateCustomFields(screenKey)
    } catch (cause) {
      toast.error('Could not save the order', cause?.message)
      loadLayout(screenKey)
    }
  }

  async function move(field, delta) {
    const custom = fields.slice()
    const index = custom.findIndex((f) => f.fieldId === field.fieldId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= custom.length) return

    ;[custom[index], custom[target]] = [custom[target], custom[index]]
    await persistOrder(custom)
  }

  /*
   * Dragging.
   *
   * Only the tenant's own fields move. A compiled field is an anchor — it is declared in
   * code and the screen renders it where the code says, so it refuses the drop rather than
   * pretending to accept one and snapping back.
   *
   * The arrows stay: a pointer is not the only way to reorder a list, and drag-and-drop has
   * no keyboard.
   */
  function startDrag(event, field) {
    if (!field.isCustom || busy) {
      event.preventDefault()
      return
    }

    // Firefox refuses to start a drag unless something is on the transfer.
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(field.fieldId))
    setDrag({ id: field.fieldId, overId: null, edge: null })
  }

  function dragOverRow(event, field) {
    // Not calling preventDefault is what makes a row refuse the drop, so compiled rows and
    // a drag that never started both fall through here untouched.
    if (drag.id === null || !field.isCustom) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    // Above the midpoint means "land before this row", below means after. The line the CSS
    // draws is on the same side, so what is shown is what will happen.
    const box = event.currentTarget.getBoundingClientRect()
    const edge = event.clientY < box.top + box.height / 2 ? 'before' : 'after'

    if (drag.overId !== field.fieldId || drag.edge !== edge) {
      setDrag((current) => ({ ...current, overId: field.fieldId, edge }))
    }
  }

  function dropOnRow(event, field) {
    if (drag.id === null || !field.isCustom) return
    event.preventDefault()

    const edge = drag.edge ?? 'before'
    const custom = fields.slice()
    const from = custom.findIndex((f) => f.fieldId === drag.id)
    const to = custom.findIndex((f) => f.fieldId === field.fieldId)

    setDrag({ id: null, overId: null, edge: null })
    if (from < 0 || to < 0) return

    const [moved] = custom.splice(from, 1)
    // The target index shifts by one when the row was taken from above it.
    const at = to + (edge === 'after' ? 1 : 0) - (from < to ? 1 : 0)
    custom.splice(at, 0, moved)

    // A drop that changed nothing is not worth a round trip, and re-saving would renumber
    // the whole list for no reason.
    if (custom.every((f, i) => f.fieldId === fields[i].fieldId)) return

    persistOrder(custom)
  }

  /** A calculated field as the real form shows it: read-only, and recalculating as you type. */
  function computedPreview(field) {
    if (field.valueMode !== 'Computed' || !String(field.formulaText ?? '').trim()) return null

    const result = evaluateFormula(field.formulaText, previewValues, field.roundTo)
    return {
      text: result.ok ? String(result.value) : '',
      error: result.ok ? null : result.error,
      missing: result.missing ?? [],
    }
  }

  const visibleInSurface = (f) => f[SURFACE_KEY[surface]] !== false

  return (
    <NhrScope>
      <PageHeader
        title="Screen Field Builder"
        desc="Add fields to a screen without a code change. A field's definition and its values are rows, so every tenant keeps its own — nothing is added to a shared table."
        icon={<Layers size={20} />}
        actions={
          <button
            className="btn btn-ghost"
            onClick={() => {
              setReloading(true)
              loadLayout(screenKey)
            }}
            disabled={loading || reloading || !screenKey}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="kpi-grid stagger mb-4">
        <MetricCard label="Configurable screens" value={String(screens.length)} tint="lavender" icon={<Table2 size={19} />} />
        <MetricCard
          label="Fields on this screen"
          value={String(rows.length)}
          tint="blue"
          icon={<ListChecks size={19} />}
          footer={screen ? `${anchors.length} compiled · ${customCount} added` : ' '}
        />
        <MetricCard
          label="Fields you added"
          value={String(customCount)}
          tint="mint"
          icon={<Plus size={19} />}
          footer={screen ? `on ${screen.label}` : ' '}
        />
        <MetricCard
          label="Compiled anchors"
          value={String(anchors.length)}
          tint="peach"
          icon={<ShieldCheck size={19} />}
          footer="defined in code — read-only"
        />
      </div>

      <div className="card card-pad mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div style={{ minWidth: 320, flex: 1, maxWidth: 460 }}>
            <label className="field">
              <span className="field-label">Screen</span>
              <select className="select" value={screenKey} onChange={(e) => setScreenKey(e.target.value)}>
                {screens.map((s) => (
                  <option key={s.screenKey} value={s.screenKey}>
                    {s.label} — {s.screenKey}
                  </option>
                ))}
              </select>
              <span className="field-help">Only screens the product declares can take extra fields</span>
            </label>
          </div>

          {screen && (
            <div className="flex items-center gap-2 flex-wrap t-sm ink-3" style={{ paddingBottom: 6 }}>
              <Badge tone="info">
                <Database size={12} /> cfg_custom_value
              </Badge>
              <Badge tone="neutral">{anchors.length} compiled field(s)</Badge>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="card card-pad">
          <SkeletonRows rows={6} />
        </div>
      )}

      {!loading && !screen && (
        <div className="card card-pad">
          <EmptyState
            icon={<Table2 size={26} />}
            title="No screens declared"
            desc="A screen becomes configurable by appearing in ScreenCatalog on the server."
          />
        </div>
      )}

      {!loading && screen && (
        <>
          {/* Both panes sit side by side wherever there is room; a narrow window gets one at
              a time rather than a preview stranded below a long field list. */}
          <div className="fb-paneswitch">
            <Segmented
              options={[
                { value: 'structure', label: 'Structure', icon: <ListChecks size={13} /> },
                { value: 'preview', label: 'Preview', icon: <Eye size={13} /> },
              ]}
              value={pane}
              onChange={setPane}
              size="sm"
            />
          </div>

          <div className={`fb-workspace pane-${pane} mb-4`}>
            <div className="card card-pad fb-pane-structure">
              <div className="fb-panel-head">
                <div className="fb-ht">
                  <div className="fb-panel-title">
                    <ListChecks size={15} /> <span>Structure</span>
                  </div>
                  <span className="fb-panel-sub">
                    Compiled fields are anchors — they are declared in code and cannot be edited here. Your own fields
                    render after them, in this order.
                  </span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => openEditor(null)}>
                  <Plus size={14} /> Add field
                </button>
              </div>

              <div className="fb-list">
                {rows.map((f, i) => {
                  const customIndex = fields.findIndex((c) => c.fieldId === f.fieldId)
                  return (
                    <div
                      key={f.isCustom ? `c${f.fieldId}` : `s${f.fieldKey}`}
                      className={[
                        'fb-row',
                        f.isCustom ? 'is-custom' : 'is-system',
                        drag.id !== null && drag.id === f.fieldId ? 'is-dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      draggable={Boolean(f.isCustom) && !busy}
                      // Where the row would land, read by the CSS that draws the line.
                      data-over={
                        f.isCustom && drag.id !== null && drag.overId === f.fieldId && drag.id !== f.fieldId
                          ? drag.edge
                          : undefined
                      }
                      onDragStart={(e) => startDrag(e, f)}
                      onDragOver={(e) => dragOverRow(e, f)}
                      onDragLeave={() =>
                        setDrag((current) =>
                          current.overId === f.fieldId ? { ...current, overId: null, edge: null } : current,
                        )
                      }
                      onDrop={(e) => dropOnRow(e, f)}
                      onDragEnd={() => setDrag({ id: null, overId: null, edge: null })}
                    >
                      <span className="fb-grip" aria-hidden="true">
                        <GripVertical size={14} />
                        <span className="fb-row-num">{i + 1}</span>
                      </span>

                      <div className="fb-row-main">
                        <div className="fb-row-label" title={f.label}>
                          {f.label}
                          {f.isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}
                        </div>
                        <div className="fb-row-meta">
                          <code className="ink-3">{f.fieldKey}</code>
                          <Badge tone="neutral">{f.controlType}</Badge>

                          {f.isCustom && f.dataSourceType !== 'None' && (
                            <Badge tone={f.dataSourceType === 'Dynamic' ? 'info' : 'neutral'}>
                              {f.dataSourceType === 'Dynamic' ? (
                                <>
                                  <Zap size={11} /> {f.binding?.sourceName || f.binding?.sourceCode || 'Bound'}
                                </>
                              ) : f.dataSourceType === 'Lookup' ? (
                                f.lookupKey
                              ) : (
                                `${f.options?.length ?? 0} option(s)`
                              )}
                            </Badge>
                          )}

                          {f.valueMode === 'Computed' && (
                            <span title={f.formulaText}>
                              <Badge tone="success">
                                <Sigma size={11} /> Calculated
                              </Badge>
                            </span>
                          )}

                          {(f.parentFieldKey || f.binding?.parentFieldKey) && (
                            <span title={`Options filtered by ${f.parentFieldKey || f.binding.parentFieldKey}`}>
                              <Badge tone="info">
                                <GitBranch size={11} /> Needs {f.parentFieldKey || f.binding.parentFieldKey}
                              </Badge>
                            </span>
                          )}

                          {f.isCustom ? (
                            <SurfaceBadges field={f} />
                          ) : (
                            <Badge tone="warning">
                              <Lock size={10} /> Compiled
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="fb-row-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Move up"
                          disabled={!f.isCustom || customIndex <= 0 || busy}
                          onClick={() => move(f, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Move down"
                          disabled={!f.isCustom || customIndex < 0 || customIndex === fields.length - 1 || busy}
                          onClick={() => move(f, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title={f.isCustom ? 'Edit this field' : 'Compiled fields are declared in code'}
                          disabled={!f.isCustom}
                          onClick={() => openEditor(f)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title={f.isCustom ? 'Remove this field' : 'Compiled fields cannot be removed'}
                          disabled={!f.isCustom}
                          onClick={() => askDelete(f)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card card-pad fb-sticky fb-pane-preview">
              <div className="fb-panel-head">
                <div className="fb-ht">
                  <div className="fb-panel-title">
                    <Eye size={15} /> <span>Live preview</span>
                  </div>
                  <span className="fb-panel-sub">{screen.label}</span>
                </div>
                <Segmented options={SURFACE_TABS} value={surface} onChange={setSurface} size="sm" />
              </div>

              {previewRows.filter(visibleInSurface).length === 0 && (
                <EmptyState
                  icon={<Eye size={24} />}
                  title="Nothing renders here"
                  desc={`No field is switched on for the ${surface}.`}
                />
              )}

              {surface === 'form' && previewRows.filter(visibleInSurface).length > 0 && (
                <div className="fb-pv">
                  {previewRows.filter(visibleInSurface).map((f) => (
                    <div
                      key={f.isCustom ? `c${f.fieldId ?? 'draft'}` : `s${f.fieldKey}`}
                      className={`fb-pv-item ${f.isCustom ? 'is-custom' : ''} ${f.__draft ? 'is-draft' : ''}`}
                      style={f.width === 'full' ? { gridColumn: 'span 2' } : undefined}
                    >
                      <span className={`fb-pv-tag ${f.isCustom ? '' : 'is-system'}`}>
                        {f.__draft ? (f.__isNew ? 'New' : 'Editing') : f.isCustom ? 'Custom' : 'Compiled'}
                      </span>

                      <label className="field">
                        <span className="field-label">
                          {f.label}
                          {f.isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}
                        </span>

                        {(() => {
                          const computed = computedPreview(f)
                          if (computed) {
                            return (
                              <>
                                <input className="input nhr-computed" readOnly tabIndex={-1} value={computed.text} />
                                {computed.error && (
                                  <div className="t-xs mt-1" style={{ color: 'var(--danger-ink)' }}>
                                    {computed.error}
                                  </div>
                                )}
                                {!computed.error && computed.missing.length > 0 && (
                                  <div className="t-xs ink-3 mt-1">Waiting on {computed.missing.join(', ')}</div>
                                )}
                              </>
                            )
                          }

                          return f.isCustom ? (
                            <CustomFieldControl
                              field={f}
                              id={`pv-${f.fieldKey}`}
                              invalid={false}
                              value={previewValues[f.fieldKey]}
                              parentValue={
                                f.parentFieldKey || f.binding?.parentFieldKey
                                  ? previewValues[f.parentFieldKey || f.binding.parentFieldKey]
                                  : undefined
                              }
                              onChange={(v) => setPreviewValues((p) => ({ ...p, [f.fieldKey]: v }))}
                            />
                          ) : (
                            <SystemControlPreview fieldKey={f.fieldKey} />
                          )
                        })()}

                        {f.helpText && <span className="field-help">{f.helpText}</span>}
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {surface !== 'form' && previewRows.filter(visibleInSurface).length > 0 && (
                <div className="fb-pv-rows">
                  {previewRows.filter(visibleInSurface).map((f) => {
                    const shown = previewValues[f.fieldKey]
                    return (
                      <div
                        key={f.isCustom ? `c${f.fieldId ?? 'draft'}` : `s${f.fieldKey}`}
                        className={`fb-pv-row ${f.isCustom ? 'is-custom' : ''}`}
                      >
                        <span className="k">{f.label}</span>
                        <span className="v">{shown === undefined || shown === '' ? '—' : String(shown)}</span>
                        {f.isCustom && (
                          <span className="fb-pv-tag" style={{ position: 'static', marginLeft: 'auto' }}>
                            {f.__draft ? (f.__isNew ? 'New' : 'Editing') : 'Custom'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="fb-legend mt-3">
                <span>
                  <i style={{ background: 'var(--primary)' }} />
                  Field you added
                </span>
                <span>
                  <i style={{ background: 'var(--surface-3)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />
                  Compiled anchor (read-only here)
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && screen && customCount > 0 && (
        <div className="card card-pad mb-4">
          <div className="fb-panel-head">
            <div>
              <div className="fb-panel-title">
                <MapPin size={15} /> Where these fields appear
              </div>
              <span className="fb-panel-sub">
                A field renders only on the surfaces it is switched on for. Its definition and whatever anybody typed
                into it stay either way.
              </span>
            </div>
          </div>

          <div className="flex-col gap-2">
            {fields.map((f) => {
              const where = SURFACES.filter((s) => f[s.key] !== false).map((s) => s.label)
              return (
                <div key={f.fieldId} className="fb-map-row">
                  <span className="t-sm fw-7 ink-1" style={{ minWidth: 150 }}>
                    {f.label}
                  </span>
                  <code className="t-xs ink-3">{f.fieldKey}</code>
                  {f.sectionKey && <Badge tone="neutral">{f.sectionKey}</Badge>}
                  <SurfaceBadges field={f} />
                  <span className="t-xs ink-3" style={{ marginLeft: 'auto' }}>
                    {where.length === 0 ? 'Not rendered anywhere right now' : `Visible on: ${where.join(' · ')}`}
                  </span>
                  <button className="btn btn-ghost btn-sm" title="Change where this field appears" onClick={() => openEditor(f)}>
                    <Pencil size={13} /> Change
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && screen && (
        <Accordion title="Recent changes" icon={<History size={15} />} badge={audit.length || undefined}>
          {audit.length === 0 && <div className="t-sm ink-3">No changes recorded for this screen yet.</div>}
          {audit.map((a) => (
            <div
              key={a.auditId}
              className="flex items-center gap-2 flex-wrap t-sm"
              style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}
            >
              <Badge tone={a.success ? 'success' : 'danger'}>{a.action}</Badge>
              <code>{a.fieldKey || '—'}</code>
              <span className="ink-3">{a.performedByName || 'system'}</span>
              <span className="ink-3">{a.performedOn ? String(a.performedOn).replace('T', ' ').slice(0, 19) : ''}</span>
              {!a.success && <span style={{ color: 'var(--danger)' }}>{a.errorText}</span>}
            </div>
          ))}
        </Accordion>
      )}

      {editor && (
        <FieldEditor
          mode={editor.mode}
          field={editor.form}
          screenKey={screenKey}
          controlTypes={controlTypes}
          dataSources={dataSources}
          siblings={fields}
          anchors={anchors}
          sections={sections}
          compiledFields={compiledFields}
          busy={busy}
          errors={editorErrors}
          message={editorMessage}
          onChange={(form) => setEditor((current) => ({ ...current, form }))}
          onSave={onSave}
          onClose={() => setEditor(null)}
        />
      )}
    </NhrScope>
  )
}
