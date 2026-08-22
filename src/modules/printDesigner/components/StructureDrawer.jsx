import { useState } from 'react'
import { GripVertical, LayoutGrid, Plus, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  Badge, Drawer, EmptyState, Field, Input, Select, Textarea,
} from '../../../config/nhr/ui/index.js'
import { ALIGNS, BORDER_STYLES, FIELD_FORMATS } from '../../../config/print/templateRenderer.js'
import {
  blockLabel, COPY_BLOCKS, FIELD_BLOCKS, newField, newSection, SECTION_ICON, SECTION_TYPES, sectionLabel,
} from './blockModel.jsx'

const asOptions = (values) => values.map((v) => ({ value: v, label: v }))

const ORIGIN_TONE = { Base: 'neutral', Context: 'warning', Custom: 'success' }

/**
 * The template's structure: which blocks it carries, in what order, and everything about
 * the one currently selected.
 *
 * A drawer rather than a column, because the page itself is what this screen is for — the
 * paper keeps the width, and the editor comes over it when it is needed.
 */
export function StructureDrawer({ open, template, available, activeIndex, onClose, onChange, onSelect, onOpenSetup }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [picker, setPicker] = useState(null)

  if (!template) {
    return (
      <Drawer open={open} onClose={onClose} title="Template structure" size="lg">
        <EmptyState title="Pick a template" desc="Choose one on the left, or create a new layout." />
      </Drawer>
    )
  }

  const sections = template.sections ?? []
  const section = sections[activeIndex]

  const patch = (changes) => onChange({ ...template, ...changes })

  const setSection = (index, changes) =>
    patch({ sections: sections.map((s, i) => (i === index ? { ...s, ...changes } : s)) })

  const removeSection = (index) => {
    patch({ sections: sections.filter((_, i) => i !== index) })
    if (activeIndex >= index && activeIndex > 0) onSelect(activeIndex - 1)
  }

  const addSection = (type) => {
    patch({ sections: [...sections, newSection(type, (sections.length + 1) * 10)] })
    onSelect(sections.length)
    setPicker(null)
  }

  const moveSection = (from, to) => {
    if (to < 0 || to >= sections.length || from === to) return
    const next = sections.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    patch({ sections: next })
    onSelect(to)
  }

  const fields = section?.fields ?? []
  const setField = (index, changes) =>
    setSection(activeIndex, { fields: fields.map((f, i) => (i === index ? { ...f, ...changes } : f)) })

  const moveField = (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    const next = fields.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    setSection(activeIndex, { fields: next })
  }

  const holdsFields = section && FIELD_BLOCKS.has(section.sectionType)
  const holdsCopy = section && COPY_BLOCKS.has(section.sectionType)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title="Template structure"
      subtitle={`${sections.length} block(s) · ${template.documentType}`}
      bodyClass="pd-structure-body"
    >
      {/* Pinned: the list never scrolls away, so a block can be picked or reordered without
          scrolling back up past its own editor. */}
      <div className="pd-structure-top">
        <Field label="Template name">
          <Input value={template.templateName} onChange={(e) => patch({ templateName: e.target.value })} />
        </Field>

        <div className="flex items-center justify-between mt-3 mb-2">
          <span className="text-xs uppercase tracking-wide opacity-60">Blocks, top to bottom</span>
          <span className="text-xs opacity-60">{sections.length} block(s)</span>
        </div>

        <div className="pd-sections">
          {sections.map((s, i) => (
            <div
              key={i}
              className={
                `pd-sec${i === activeIndex ? ' is-active' : ''}` +
                `${dragIndex === i ? ' is-dragging' : ''}` +
                `${overIndex === i && dragIndex !== null && dragIndex !== i ? (i < dragIndex ? ' is-over-above' : ' is-over-below') : ''}`
              }
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIndex(i)
              }}
              onDrop={() => {
                if (dragIndex !== null) moveSection(dragIndex, i)
                setDragIndex(null)
                setOverIndex(null)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              onClick={() => onSelect(i)}
            >
              <span className="pd-sec-grip" title="Drag to reorder">
                <GripVertical size={13} />
              </span>
              <span className="pd-sec-icon">{SECTION_ICON[s.sectionType] || <LayoutGrid size={13} />}</span>
              <span className="pd-sec-name">{blockLabel(s)}</span>

              {FIELD_BLOCKS.has(s.sectionType) && (
                <Badge tone={s.fields?.length ? 'info' : 'neutral'}>
                  {s.fields?.length ? `${s.fields.length} field(s)` : 'auto'}
                </Badge>
              )}
              {s.isVisible === false && <Badge tone="warning">Hidden</Badge>}

              <span className="pd-sec-tools" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" title="Remove block" onClick={() => removeSection(i)}>
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          ))}

          {sections.length === 0 && (
            <div className="t-sm ink-3">
              No blocks. An empty template prints the whole data context, which is what the standard templates do until
              somebody curates them.
            </div>
          )}
        </div>

        <div className="pd-structure-bar">
          <button className="btn btn-soft btn-sm" onClick={() => setPicker(true)}>
            <Plus size={13} /> Add a block
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={!holdsFields}
            title={
              holdsFields
                ? `Add a value to ${blockLabel(section)}`
                : 'Select a field grid or table — those are the blocks that hold values'
            }
            onClick={() => setSection(activeIndex, { fields: [...fields, newField()] })}
          >
            <SlidersHorizontal size={13} /> Add a value
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onOpenSetup}>
            <Settings2 size={13} /> Page setup
          </button>
        </div>

        {picker && (
          <div className="pd-avail mt-2">
            {SECTION_TYPES.map((t) => (
              <button key={t.value} className="pd-avail-item" onClick={() => addSection(t.value)}>
                <span className="pd-avail-label">{t.label}</span>
                <span className="t-xs ink-3">{t.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {section && (
        <div className="pd-structure-editor">
          <div className="pd-sec-editor">
            <div className="text-xs uppercase tracking-wide opacity-60 mb-2">
              Selected block — {sectionLabel(section.sectionType)}
            </div>

            <div className="form-grid">
              <div className="span-2">
                <Field label="Heading" help="Printed above the block. Blank for none.">
                  <Input value={section.title ?? ''} onChange={(e) => setSection(activeIndex, { title: e.target.value })} />
                </Field>
              </div>

              <Field label="Visible">
                <Select
                  options={[
                    { value: 'yes', label: 'Printed' },
                    { value: 'no', label: 'Hidden' },
                  ]}
                  value={section.isVisible === false ? 'no' : 'yes'}
                  onChange={(e) => setSection(activeIndex, { isVisible: e.target.value === 'yes' })}
                />
              </Field>

              {holdsFields && (
                <Field label="Columns">
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    value={section.columnCount ?? 2}
                    onChange={(e) => setSection(activeIndex, { columnCount: Number(e.target.value) || 1 })}
                  />
                </Field>
              )}

              <Field label="Border">
                <Select
                  options={asOptions(BORDER_STYLES)}
                  value={section.borderStyle ?? 'none'}
                  onChange={(e) => setSection(activeIndex, { borderStyle: e.target.value })}
                />
              </Field>

              <Field label="Line colour" help="Blank follows the accent.">
                <Input
                  placeholder="#4f46e5"
                  value={section.borderColor ?? ''}
                  onChange={(e) => setSection(activeIndex, { borderColor: e.target.value })}
                />
              </Field>

              <Field label="Fill">
                <Input
                  placeholder="none"
                  value={section.backgroundColor ?? ''}
                  onChange={(e) => setSection(activeIndex, { backgroundColor: e.target.value })}
                />
              </Field>

              <Field label={section.sectionType === 'Spacer' ? 'Height (mm)' : 'Padding (mm)'}>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={section.paddingMm ?? 0}
                  onChange={(e) => setSection(activeIndex, { paddingMm: Number(e.target.value) || 0 })}
                />
              </Field>
            </div>

            {holdsCopy && (
              <Field
                label={section.sectionType === 'RichText' ? 'Standing copy' : 'Letter copy'}
                help="One paragraph per blank line. {{employeeName}} and any other field key are filled in when it prints."
              >
                <Textarea
                  rows={7}
                  value={copyOf(section)}
                  onChange={(e) => setSection(activeIndex, { configJson: JSON.stringify({ text: e.target.value }) })}
                />
              </Field>
            )}

            {section.sectionType === 'Signature' && (
              <Field label="Signing slots" help="One per line.">
                <Textarea
                  rows={3}
                  value={slotsOf(section).join('\n')}
                  onChange={(e) =>
                    setSection(activeIndex, {
                      configJson: JSON.stringify({
                        slots: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                      }),
                    })
                  }
                />
              </Field>
            )}

            {holdsFields && (
              <>
                <div className="text-xs uppercase tracking-wide opacity-60 mt-3 mb-2">Values in this block</div>

                {fields.length === 0 && (
                  <div className="t-sm ink-3 mb-2">
                    No values chosen, so this block prints everything it is given. Add one to curate it instead.
                  </div>
                )}

                <div className="pd-fields">
                  {fields.map((f, i) => (
                    <div key={i} className="pd-field">
                      <div className="pd-field-head">
                        <Select
                          options={available.map((a) => ({ value: a.fieldKey, label: a.label }))}
                          placeholder="— pick a value —"
                          value={f.fieldKey}
                          onChange={(e) => setField(i, { fieldKey: e.target.value })}
                        />
                        {f.fieldKey && f.fieldKey !== '@static' && (
                          <Badge tone={ORIGIN_TONE[originOf(available, f.fieldKey)] ?? 'neutral'}>
                            {originOf(available, f.fieldKey) ?? 'Unknown'}
                          </Badge>
                        )}
                        <span className="pd-sec-tools">
                          <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => moveField(i, -1)}>
                            ↑
                          </button>
                          <button
                            className="icon-btn"
                            title="Move down"
                            disabled={i === fields.length - 1}
                            onClick={() => moveField(i, 1)}
                          >
                            ↓
                          </button>
                          <button
                            className="icon-btn"
                            title="Remove"
                            onClick={() => setSection(activeIndex, { fields: fields.filter((_, j) => j !== i) })}
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      </div>

                      <div className="pd-field-body">
                        <Input
                          placeholder="Caption"
                          value={f.label ?? ''}
                          onChange={(e) => setField(i, { label: e.target.value })}
                        />
                        <Select
                          options={asOptions(FIELD_FORMATS)}
                          value={f.format ?? 'text'}
                          onChange={(e) => setField(i, { format: e.target.value })}
                        />
                        <Select
                          options={asOptions(ALIGNS)}
                          value={f.align ?? 'left'}
                          onChange={(e) => setField(i, { align: e.target.value })}
                        />
                        <Input
                          type="number"
                          min={5}
                          max={100}
                          value={f.widthPercent ?? 50}
                          onChange={(e) => setField(i, { widthPercent: Number(e.target.value) || 50 })}
                        />

                        <label className="flex items-center gap-2 t-xs">
                          <input
                            type="checkbox"
                            checked={f.showLabel !== false}
                            onChange={(e) => setField(i, { showLabel: e.target.checked })}
                          />
                          Caption
                        </label>
                        <label className="flex items-center gap-2 t-xs">
                          <input
                            type="checkbox"
                            checked={Boolean(f.isBold)}
                            onChange={(e) => setField(i, { isBold: e.target.checked })}
                          />
                          Bold
                        </label>

                        {f.fieldKey === '@static' && (
                          <Input
                            placeholder="Fixed text"
                            value={f.staticText ?? ''}
                            onChange={(e) => setField(i, { staticText: e.target.value })}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={() => setSection(activeIndex, { fields: [...fields, newField('@static')] })}
                >
                  <Plus size={13} /> Add fixed text
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}

/** A block's authored copy, whatever shape it was stored in. */
function copyOf(section) {
  const raw = section.configJson
  if (!raw) return ''
  if (!raw.trim().startsWith('{')) return raw

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.paragraphs)) return parsed.paragraphs.join('\n\n')
    if (typeof parsed?.text === 'string') return parsed.text
    if (typeof parsed?.html === 'string') return parsed.html
    return ''
  } catch {
    return raw
  }
}

function slotsOf(section) {
  try {
    const parsed = JSON.parse(section.configJson || '{}')
    return Array.isArray(parsed?.slots) ? parsed.slots : []
  } catch {
    return []
  }
}

/** Where a key comes from, so an author can see a Custom one is theirs to keep alive. */
const originOf = (available, key) => available.find((a) => a.fieldKey === key)?.origin
