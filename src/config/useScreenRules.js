import { useCallback } from 'react'
import { useFieldRules } from './ConfigContext.js'

/**
 * Validation that honours the same Layer 2 config the form renders from. A screen asks
 * "is this field mandatory for this tenant?" rather than deciding for itself.
 *
 * The server checks the same things again; this is only for speed of feedback.
 */
export function useScreenRules(screenKey) {
  const rules = useFieldRules(screenKey)

  const isRequired = useCallback(
    (fieldKey, productDefault = false) => {
      const rule = rules.ruleFor(fieldKey)
      return rule ? rule.isRequired === true : productDefault
    },
    [rules],
  )

  const isVisible = useCallback((fieldKey) => rules.isVisible(fieldKey), [rules])

  const labelFor = useCallback((fieldKey, fallback) => rules.labelFor(fieldKey, fallback), [rules])

  /**
   * Runs the config-driven mandatory checks for a form.
   *
   * A hidden field is never required — otherwise hiding a field for one tenant
   * (acceptance scenario 1) would make its form unsubmittable.
   *
   * @param {object} values
   * @param {Array<{key: string, label: string, required?: boolean}>} fields
   * @returns {Record<string,string>} errors keyed by field
   */
  const validateRequired = useCallback(
    (values, fields) => {
      const errors = {}
      for (const field of fields) {
        if (!isVisible(field.key)) continue
        if (!isRequired(field.key, field.required)) continue

        const value = values[field.key]
        const empty =
          value === null || value === undefined || String(value).trim() === '' || value === 0
        if (empty) errors[field.key] = `${labelFor(field.key, field.label)} is required.`
      }
      return errors
    },
    [isRequired, isVisible, labelFor],
  )

  return { isRequired, isVisible, labelFor, validateRequired }
}
