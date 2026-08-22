import { DateInput, NumberInput, SelectInput, TextArea, TextInput } from '../../core/controls/inputs.jsx'
import { useFieldOptions } from './fieldOptions.js'

/**
 * One tenant-defined field, rendered with the same controls a compiled field uses — so an
 * extra field is visually indistinguishable from one the product shipped with.
 *
 * A calculated field renders read-only when its mode is Always: the value is the formula's
 * answer, and an input somebody can type into would promise otherwise. Prefill leaves it
 * editable, because there the formula only suggests.
 *
 * @param {{
 *   field: object,
 *   value: any,
 *   onChange: (value: string) => void,
 *   id: string,
 *   invalid: boolean,
 *   disabled?: boolean,
 *   parentValue?: string,
 *   options?: Array<{value: string, label: string}>,
 * }} props
 */
export function CustomFieldControl({
  field,
  value,
  onChange,
  onBlur,
  id,
  invalid,
  disabled = false,
  parentValue,
  options: supplied,
}) {
  const resolved = useFieldOptions(field, parentValue)

  // The builder's preview passes the list it is holding, so an unsaved change is visible
  // before anything has been stored.
  const options = supplied ?? resolved.options

  const isComputed =
    field.valueMode === 'Computed' && (field.recalcMode ?? 'Always') !== 'Prefill'

  const common = {
    id,
    invalid,
    disabled: disabled || isComputed,
    readOnly: isComputed || undefined,
    value: value ?? '',
    placeholder: field.placeholder || undefined,
    onChange: (e) => onChange(e.target.value),
    onBlur,
  }

  switch (field.controlType) {
    case 'textarea':
      return <TextArea {...common} maxLength={field.maxLength || undefined} rows={3} />

    case 'number':
    case 'decimal':
      return (
        <NumberInput
          {...common}
          step={field.controlType === 'decimal' ? '0.01' : '1'}
          min={field.rangeMin || undefined}
          max={field.rangeMax || undefined}
        />
      )

    case 'date':
      return <DateInput {...common} value={toDateInput(value)} />

    case 'datetime':
      return (
        <input
          type="datetime-local"
          className={`input${invalid ? ' input--invalid' : ''}`}
          aria-invalid={invalid || undefined}
          id={id}
          disabled={disabled || isComputed}
          value={toDateTimeInput(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'checkbox':
      return (
        <input
          type="checkbox"
          id={id}
          disabled={disabled}
          checked={value === '1' || value === true || value === 'true'}
          onChange={(e) => onChange(e.target.checked ? '1' : '0')}
        />
      )

    case 'radio':
      return (
        <div role="radiogroup" aria-labelledby={id} style={{ display: 'flex', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
          {options.map((o) => (
            <label key={String(o.value)} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
              <input
                type="radio"
                name={id}
                disabled={disabled}
                value={o.value}
                checked={String(value ?? '') === String(o.value)}
                onChange={() => onChange(String(o.value))}
              />
              <span>{o.label}</span>
            </label>
          ))}
          {options.length === 0 && <span className="field__hint">{emptyReason(field, parentValue, resolved.busy)}</span>}
        </div>
      )

    case 'dropdown':
      return (
        <SelectInput
          {...common}
          options={options}
          placeholder={options.length === 0 ? emptyReason(field, parentValue, resolved.busy) : '— select —'}
        />
      )

    default:
      return <TextInput {...common} maxLength={field.maxLength || undefined} />
  }
}

/**
 * Why a list is empty. A cascading list with nothing chosen upstream is not broken — it is
 * waiting — and saying so is the difference between a user picking the field above and a
 * user filing a bug.
 */
function emptyReason(field, parentValue, busy) {
  if (busy) return 'Loading…'

  const parent = field.parentFieldKey || field.binding?.parentFieldKey
  if (parent && (parentValue === undefined || parentValue === null || parentValue === '')) {
    return `Choose ${parent} first`
  }

  return 'No options'
}

/** The API sends a full timestamp; <input type="date"> wants only the date part. */
const toDateInput = (value) => (value ? String(value).slice(0, 10) : '')

const toDateTimeInput = (value) => {
  if (!value) return ''
  const text = String(value).replace(' ', 'T')
  return text.length >= 16 ? text.slice(0, 16) : text
}
