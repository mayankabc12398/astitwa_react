import { useId } from 'react'

/**
 * Label + control + error, wired for screen readers.
 *
 * Base screens never render this directly with a hardcoded caption — they go through
 * <DynamicField>, which reads the caption and the required flag from Layer 2 config.
 * This component only knows how to lay a field out.
 */
export function Field({ label, required = false, error, hint, htmlFor, children }) {
  const generatedId = useId()
  const id = htmlFor ?? generatedId

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {typeof children === 'function' ? children({ id, invalid: Boolean(error) }) : children}

      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
