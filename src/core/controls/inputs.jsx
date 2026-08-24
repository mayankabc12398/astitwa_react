/**
 * Thin wrappers around the native controls. They exist so styling and the invalid state
 * are consistent, not to add behaviour.
 */

function classFor(base, invalid, className) {
  return [base, invalid ? `${base}--invalid` : '', className].filter(Boolean).join(' ')
}

export function TextInput({ invalid = false, className = '', ...rest }) {
  return <input type="text" className={classFor('input', invalid, className)} aria-invalid={invalid || undefined} {...rest} />
}

export function DateInput({ invalid = false, className = '', ...rest }) {
  return <input type="date" className={classFor('input', invalid, className)} aria-invalid={invalid || undefined} {...rest} />
}

export function NumberInput({ invalid = false, className = '', ...rest }) {
  return <input type="number" className={classFor('input', invalid, className)} aria-invalid={invalid || undefined} {...rest} />
}

export function CheckboxInput({ invalid = false, className = '', ...rest }) {
  return (
    <input
      type="checkbox"
      className={classFor('checkbox', invalid, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export function TextArea({ invalid = false, className = '', rows = 3, ...rest }) {
  return (
    <textarea rows={rows} className={classFor('textarea', invalid, className)} aria-invalid={invalid || undefined} {...rest} />
  )
}

/**
 * @param {{ options: Array<{value: any, label: string}>, placeholder?: string }} props
 */
export function SelectInput({ options = [], placeholder = '— select —', invalid = false, className = '', ...rest }) {
  return (
    <select className={classFor('select', invalid, className)} aria-invalid={invalid || undefined} {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
