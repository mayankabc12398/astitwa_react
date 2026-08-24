import { createContext, useContext, useMemo } from 'react'
import { Field } from '../core/controls/Field.jsx'
import { useFieldRules } from './ConfigContext.js'

const ScreenContext = createContext(null)

/**
 * Layer 2, the part every form goes through.
 *
 * A screen declares which fields exist and how to render each control. Whether a field is
 * shown, whether it is mandatory, what its caption reads and where it sits in the order are
 * all read from cfg_field_rule for the signed-in tenant.
 *
 * Hardcoding a caption or a required flag in a form component is a defect (section 7.2).
 * The `label` prop here is the product default, not the tenant's answer — a cfg_field_rule
 * row overrides it, and hiding a field is one row with is_visible = 0.
 */
export function ConfigForm({ screenKey, hints, children, className = 'form-grid' }) {
  const rules = useFieldRules(screenKey)

  // hints is useScreenHooks().fieldHints — what the tenant's scripts asked to say under each
  // control. Threaded through the context rather than field by field, so a script can caption
  // any field on the screen without the screen carrying a prop for every one of them.
  const value = useMemo(() => ({ screenKey, rules, hints }), [screenKey, rules, hints])

  return (
    <ScreenContext.Provider value={value}>
      <div className={className}>{children}</div>
    </ScreenContext.Provider>
  )
}

function useScreen() {
  const value = useContext(ScreenContext)
  if (!value) throw new Error('<DynamicField> must be used inside <ConfigForm screenKey="…">.')
  return value
}

/**
 * @param {{
 *   fieldKey: string,
 *   label: string,          // product default caption; a config row overrides it
 *   required?: boolean,     // product default; a config row overrides it
 *   defaultSeq?: number,
 *   error?: string,
 *   hint?: string,
 *   span?: number,          // grid columns to span
 *   children: (args: {id: string, invalid: boolean, required: boolean}) => any
 * }} props
 */
export function DynamicField({
  fieldKey,
  label,
  required = false,
  defaultSeq = 10,
  error,
  hint,
  span,
  children,
}) {
  const { rules, hints } = useScreen()

  const rule = rules.ruleFor(fieldKey)

  // A field with no row keeps the product default. A row wins on every attribute it sets.
  if (rule && rule.isVisible === false) return null

  const caption = rule?.label || label
  const isRequired = rule ? rule.isRequired === true : required
  const seq = rule?.seqNo ?? defaultSeq

  // Same precedence as the caption: the product ships the `hint` prop, and a tenant's script
  // overrides it. Returning '' is how a script takes its own caption back off and lets the
  // shipped one stand again, so the empty string has to fall through rather than win.
  const hintText = hints?.[fieldKey] || hint

  return (
    <div style={{ order: seq, gridColumn: span ? `span ${span}` : undefined }}>
      <Field label={caption} required={isRequired} error={error} hint={hintText}>
        {({ id, invalid }) => children({ id, invalid, required: isRequired })}
      </Field>
    </div>
  )
}
