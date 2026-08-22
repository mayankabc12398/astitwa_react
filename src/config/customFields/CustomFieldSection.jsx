import { Field } from '../../core/controls/Field.jsx'
import { CustomFieldControl } from './CustomFieldControl.jsx'

/**
 * Drops a screen's tenant-defined fields into a form.
 *
 * Rendered inside the same <ConfigForm> as the compiled fields, using the same <Field>
 * wrapper and the same controls, so an extra field is indistinguishable from one the product
 * shipped with. `order` places them after the compiled fields by default, which is where
 * cfg_custom_field.seq_no starts.
 *
 * Deliberately not wrapped in <DynamicField>: that component reads cfg_field_rule, which
 * keys on a compiled field. A custom field carries its own caption, required flag and
 * position, so a rule row for it would be a second place to change the same thing.
 *
 * onFieldBlur and onFieldChange are the screen's field hook slots. A custom field gets the
 * same two events a compiled one does — hr.employee.field.<fieldKey>.onBlur — so a tenant
 * that adds a field through Field Builder can hang a script on it without a deployment.
 * Screens that pass neither behave exactly as before.
 *
 * @param {{
 *   fields: Array<object>,
 *   values: Record<string, any>,
 *   errors?: Record<string, string>,
 *   onChange: (fieldKey: string, value: string) => void,
 *   onFieldBlur?: (fieldKey: string) => void,
 *   onFieldChange?: (fieldKey: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export function CustomFieldSection({
  fields,
  values,
  errors = {},
  onChange,
  onFieldBlur,
  onFieldChange,
  disabled = false,
}) {
  const visible = (fields ?? []).filter((f) => f.showInForm !== false)
  if (visible.length === 0) return null

  return (
    <>
      {visible.map((field) => (
        <div
          key={field.fieldKey}
          style={{ order: field.seqNo ?? 1000, gridColumn: field.width === 'full' ? 'span 2' : undefined }}
        >
          <Field
            label={field.label}
            required={field.isRequired}
            hint={field.helpText || undefined}
            error={errors[field.fieldKey]}
          >
            {({ id, invalid }) => (
              <CustomFieldControl
                field={field}
                id={id}
                invalid={invalid}
                disabled={disabled}
                value={values[field.fieldKey]}
                // A cascading list reads its parent from the same value map, so a field can
                // depend on another custom field without either knowing about the other.
                parentValue={
                  field.parentFieldKey || field.binding?.parentFieldKey
                    ? values[field.parentFieldKey || field.binding.parentFieldKey]
                    : undefined
                }
                onBlur={onFieldBlur ? () => onFieldBlur(field.fieldKey) : undefined}
                // The whole definition list travels with the change so calculated fields
                // can be refilled: a formula reads other fields, so no single field knows
                // enough to update itself.
                onChange={(next) => {
                  onChange(field.fieldKey, next, visible)
                  onFieldChange?.(field.fieldKey)
                }}
              />
            )}
          </Field>
        </div>
      ))}
    </>
  )
}

/**
 * Read-only rendering for a detail view. Uses the same definitions, so a value captured on
 * the form is never invisible afterwards.
 */
export function CustomFieldDetails({ fields, values }) {
  const visible = (fields ?? []).filter((f) => f.showInDetail !== false)
  if (visible.length === 0) return null

  return (
    <dl className="detail-list">
      {visible.map((field) => (
        <div key={field.fieldKey}>
          <dt>{field.label}</dt>
          <dd>{displayValue(field, values[field.fieldKey])}</dd>
        </div>
      ))}
    </dl>
  )
}

function displayValue(field, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (field.controlType === 'checkbox') return value === '1' || value === true ? 'Yes' : 'No'

  if (field.dataSourceType === 'Static') {
    const option = (field.options ?? []).find((o) => String(o.optionValue) === String(value))
    if (option) return option.optionLabel || option.optionValue
  }

  return String(value)
}
