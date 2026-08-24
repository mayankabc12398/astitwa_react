import { useMemo, useState } from 'react'
import { Button } from '../../../core/controls/Button.jsx'
import { Modal } from '../../../core/controls/Modal.jsx'
import { SelectInput, TextInput } from '../../../core/controls/inputs.jsx'
import { useUi } from '../../../core/controls/uiContext.js'
import { invalidateLookup } from '../../../core/hooks/useLookup.js'

/**
 * The blue "+" that sits beside a handful of fields on the registration screen.
 *
 * It is a real control rather than decoration: a desk that has the patient in front of them
 * cannot leave the form to go and create the district they live in. Picking goes through
 * ui.pickList — the same dialog scripts get — and adding goes through the small modal below,
 * so nothing here reimplements filtering, focus trapping or keyboard handling.
 *
 * A value added this way is selected immediately and offered for the rest of the session.
 * invalidateLookup() is called for fields backed by a real endpoint, so the next screen to
 * read that lookup fetches it again rather than serving a cached list without the new row.
 */

function AddButton({ onClick, disabled, title }) {
  return (
    <Button
      className="pf-addon__btn"
      variant="primary"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Add or pick ${title}`}
      title={`Add or pick ${title}`}
    >
      <span aria-hidden="true">+</span>
    </Button>
  )
}

function QuickAddModal({ title, onSave, onClose }) {
  const [text, setText] = useState('')
  const trimmed = text.trim()

  return (
    <Modal
      title={`Add ${title}`}
      narrow
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={!trimmed} onClick={() => onSave(trimmed)}>
            Add
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <label className="field__label" htmlFor="pf-quick-add">
        {title}
      </label>
      <TextInput
        id="pf-quick-add"
        value={text}
        autoFocus
        maxLength={120}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmed) {
            e.preventDefault()
            onSave(trimmed)
          }
        }}
      />
      <p className="field__hint">Added for this session and selected straight away.</p>
    </Modal>
  )
}

/**
 * A select with the "+" beside it.
 *
 * @param {{
 *   id: string, title: string, invalid?: boolean, disabled?: boolean,
 *   options: Array<{value: any, label: string}>,
 *   fieldProps: object,                  // useScreenHooks().fieldProps(key)
 *   onPick: (value: string) => void,     // programmatic selection, e.g. after a quick add
 *   lookupPath?: string,
 *   placeholder?: string,
 * }} props
 */
export function PickSelect({
  id,
  title,
  invalid = false,
  disabled = false,
  options = [],
  fieldProps,
  onPick,
  lookupPath,
  placeholder = '— select —',
}) {
  const ui = useUi()
  const [added, setAdded] = useState([])
  const [adding, setAdding] = useState(false)

  const all = useMemo(() => {
    const known = new Set(options.map((o) => String(o.value)))
    return [...options, ...added.filter((o) => !known.has(String(o.value)))]
  }, [options, added])

  // A value that came from an older record is not in either list; offering it keeps the
  // control showing what is actually stored instead of falling blank.
  const current = fieldProps?.value ?? ''
  const choices = all.some((o) => String(o.value) === String(current)) || current === ''
    ? all
    : [...all, { value: current, label: String(current) }]

  async function openPicker() {
    const picked = await ui.pickList({
      title,
      columns: [{ key: 'label', label: title }],
      rows: choices.map((o) => ({ label: o.label, value: o.value })),
      emptyAction: { label: `Add a new ${title.toLowerCase()}`, action: 'add' },
    })
    if (!picked) return
    if (picked.__action) {
      setAdding(true)
      return
    }
    onPick(picked.value)
  }

  function save(value) {
    setAdded((current) => [...current, { value, label: value }])
    setAdding(false)
    onPick(value)
    if (lookupPath) invalidateLookup(lookupPath)
    ui.toast(`${title} “${value}” added.`)
  }

  return (
    <div className="pf-addon">
      <SelectInput id={id} invalid={invalid} disabled={disabled} options={choices} placeholder={placeholder} {...fieldProps} />
      <AddButton onClick={openPicker} disabled={disabled} title={title} />
      {adding && <QuickAddModal title={title} onSave={save} onClose={() => setAdding(false)} />}
    </div>
  )
}

/**
 * A text input with the "+" beside it, for the identifiers that have no master list —
 * family number, dependent ID, a relative's phone.
 */
export function PickText({ id, title, invalid = false, disabled = false, fieldProps, onPick, readOnly = false, ...rest }) {
  const ui = useUi()
  const [adding, setAdding] = useState(false)

  return (
    <div className="pf-addon">
      <TextInput
        id={id}
        invalid={invalid}
        disabled={disabled}
        readOnly={readOnly}
        className={readOnly ? 'pf-readonly' : ''}
        {...fieldProps}
        {...rest}
      />
      <AddButton onClick={() => setAdding(true)} disabled={disabled} title={title} />
      {adding && (
        <QuickAddModal
          title={title}
          onClose={() => setAdding(false)}
          onSave={(value) => {
            setAdding(false)
            onPick(value)
            ui.toast(`${title} set to “${value}”.`)
          }}
        />
      )}
    </div>
  )
}

/**
 * A select carrying a value, with the small ✕ that clears it — the pre-filled fields in the
 * design (Type, Country, Religion) each have one.
 */
export function ClearableSelect({ id, invalid = false, disabled = false, options, placeholder, fieldProps, onClear, label }) {
  const hasValue = Boolean(fieldProps?.value)

  return (
    <div className="pf-clearable">
      <SelectInput id={id} invalid={invalid} disabled={disabled} options={options} placeholder={placeholder} {...fieldProps} />
      {hasValue && !disabled && (
        <button type="button" className="pf-clearable__x" onClick={onClear} aria-label={`Clear ${label}`} title={`Clear ${label}`}>
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  )
}
