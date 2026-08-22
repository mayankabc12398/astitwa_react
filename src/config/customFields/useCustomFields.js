import { useCallback, useEffect, useState } from 'react'
import { api } from '../../core/api/client.js'
import { evaluateFormula, extractRefs, inEvaluationOrder } from './formula.js'

/**
 * Layer 2 — the fields a tenant added to a screen the product already ships.
 *
 * Definitions are cached per screen key: every form that renders custom fields asks for the
 * same list on every mount, and re-fetching it would put a request in front of the first
 * paint of a form that already had its answer.
 */
const definitions = new Map()

/** Call after the field builder saves, so open forms pick the change up. */
export function invalidateCustomFields(screenKey) {
  if (screenKey) definitions.delete(screenKey)
  else definitions.clear()
}

/**
 * The definitions for one screen.
 *
 * @param {string} screenKey e.g. 'hr.employee'
 * @param {{ enabled?: boolean }} [options]
 */
export function useCustomFields(screenKey, { enabled = true } = {}) {
  const [fetched, setFetched] = useState(null)
  const [attempt, setAttempt] = useState(0)

  const cached = definitions.get(screenKey)
  const fields = cached ?? (fetched?.screenKey === screenKey ? fetched.fields : null)

  useEffect(() => {
    if (!enabled || !screenKey || definitions.has(screenKey)) return undefined

    const controller = new AbortController()
    let cancelled = false

    api
      .get('/hr/custom-field', { params: { screenKey }, signal: controller.signal })
      .then((rows) => {
        const list = rows ?? []
        definitions.set(screenKey, list)
        if (!cancelled) setFetched({ screenKey, fields: list })
      })
      .catch((cause) => {
        if (cancelled || cause?.name === 'AbortError') return
        // A screen whose extra fields cannot load still has to render its compiled ones.
        // Treating the failure as "no extra fields" keeps the form usable.
        setFetched({ screenKey, fields: [] })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [screenKey, enabled, attempt])

  const reload = useCallback(() => {
    definitions.delete(screenKey)
    setFetched(null)
    setAttempt((n) => n + 1)
  }, [screenKey])

  return { fields: fields ?? [], busy: enabled && fields === null, reload }
}

/**
 * A record's custom values, loaded once the record has an id and exposed as a plain
 * key/value object so a form can hold them beside its own state.
 *
 * @param {string} screenKey
 * @param {number|string|undefined} recordId  falsy for a record that has not been saved yet
 */
export function useCustomValues(screenKey, recordId) {
  const isNew = !recordId || recordId === 'new' || Number(recordId) <= 0
  const key = `${screenKey}|${recordId ?? ''}`

  const [currentKey, setCurrentKey] = useState(key)
  const [values, setValues] = useState({})
  const [loadedKey, setLoadedKey] = useState(null)

  // Navigating from one record to another reuses this component. Resetting during render is
  // React's documented way to key state off a prop, and it is what useRecordForm already
  // does — clearing inside the effect would render the previous record's values for a frame.
  if (currentKey !== key) {
    setCurrentKey(key)
    setValues({})
  }

  // Derived by comparing what was loaded against what is wanted, the same way usePagedList
  // derives its busy flag. A separate flag would have to be set inside the effect, which is
  // the synchronous write that causes a second render before anything has been fetched.
  const loading = Boolean(screenKey) && !isNew && loadedKey !== key

  useEffect(() => {
    if (!screenKey || isNew) return undefined

    const controller = new AbortController()
    let cancelled = false

    api
      .get('/hr/custom-field/value', {
        params: { screenKey, recordId: Number(recordId) },
        signal: controller.signal,
      })
      .then((rows) => {
        if (cancelled) return
        const next = {}
        for (const row of rows ?? []) next[row.fieldKey] = row.valueText ?? ''
        setValues(next)
        setLoadedKey(key)
      })
      .catch((cause) => {
        if (cancelled || cause?.name === 'AbortError') return
        // A record whose extra values cannot load still has to render its compiled fields.
        setValues({})
        setLoadedKey(key)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [screenKey, recordId, isNew, key])

  /**
   * Sets one value and refills every calculated field that reads it.
   *
   * The server recalculates again on save and its answer is what gets stored; this is so
   * the number appears as the user types rather than after they submit. Both sides run the
   * same grammar, so what is on screen is what will be kept.
   *
   * @param {string} fieldKey
   * @param {any} value
   * @param {Array<object>} [fields] the screen's definitions, needed to recalculate
   */
  const setValue = useCallback((fieldKey, value, fields) => {
    setValues((current) => recalculate({ ...current, [fieldKey]: value }, fields))
  }, [])

  /**
   * Writes the values once the record's own save has returned an id.
   *
   * Server-side validation is authoritative, exactly as it is for a compiled field: errors
   * come back keyed by field key and are bound to the same inputs.
   */
  const save = useCallback(
    async (id, fields) => {
      const targetId = Number(id)
      if (!targetId || targetId <= 0) return { ok: true, errors: {} }

      // Only fields that are actually on the form are sent. A definition the tenant hid
      // belongs to nobody on this screen, and posting an empty value for it would clear
      // whatever another surface had stored.
      const payload = (fields ?? [])
        .filter((f) => f.showInForm !== false)
        .map((f) => ({ fieldKey: f.fieldKey, valueText: values[f.fieldKey] ?? '' }))

      if (payload.length === 0) return { ok: true, errors: {} }

      try {
        await api.post('/hr/custom-field/value', { screenKey, recordId: targetId, values: payload })
        return { ok: true, errors: {} }
      } catch (cause) {
        return { ok: false, errors: cause?.fieldErrors ?? {}, message: cause?.message }
      }
    },
    [screenKey, values],
  )

  return { values, setValues, setValue, save, loading }
}

/**
 * The blank a form starts from: every field's configured default, so a new record opens the
 * way the tenant said it should rather than empty.
 */
export function initialCustomValues(fields) {
  const blank = {}
  for (const field of fields ?? []) blank[field.fieldKey] = field.defaultValue ?? ''
  return recalculate(blank, fields)
}

/**
 * Fills in every calculated field, in an order where each is evaluated after the fields it
 * reads — so a formula that depends on another formula sees the derived value rather than
 * the blank it started as.
 *
 * Always overwrites whatever is there, which is why its control is read-only. Prefill only
 * fills a blank, so a suggestion can be typed over. A formula that cannot be evaluated
 * leaves its field alone: a half-filled form is normal, and blanking a field because the
 * one it reads has not been typed yet would fight the user.
 */
export function recalculate(values, fields) {
  const computed = (fields ?? []).filter(
    (f) => f.valueMode === 'Computed' && String(f.formulaText ?? '').trim() !== '',
  )
  if (computed.length === 0) return values

  const ordered = inEvaluationOrder(
    computed.map((f) => ({
      ...f,
      formula: f.formulaText,
      formulaRefs: f.formulaRefsCsv ? f.formulaRefsCsv.split(',').map((s) => s.trim()).filter(Boolean) : extractRefs(f.formulaText),
    })),
  )

  const next = { ...values }

  for (const field of ordered) {
    const prefillOnly = (field.recalcMode ?? 'Always') === 'Prefill'
    if (prefillOnly && String(next[field.fieldKey] ?? '').trim() !== '') continue

    const result = evaluateFormula(field.formulaText, next, field.roundTo)
    if (result.ok) next[field.fieldKey] = String(result.value)
  }

  return next
}
