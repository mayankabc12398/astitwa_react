import { useCallback, useEffect, useRef, useState } from 'react'
import { useUi } from '../controls/uiContext.js'
import { fieldHookKey, hookDebounceMs, runHook } from './hookBridge.js'

/**
 * Every hook slot a form screen has, in one place.
 *
 * Screens used to carry this themselves: the refs, the debounce timers, the "which bucket
 * does this field key live in" question, and the code that acts on a result. That worked for
 * one screen and became four copies of the same seventy lines the moment a second screen
 * wanted it — and then a fix to any of it had to be made four times.
 *
 * So the plumbing lives here and a screen declares what it has. A screen that passes only a
 * record gets the three screen-level slots; one that also passes its custom fields gets the
 * per-field slots and ctx.custom as well. Nothing here knows about employees, and adding a
 * slot to this file gives it to every screen at once.
 *
 * This is Layer 1 and imports only Layer 1. runHook returns {} when no engine is registered,
 * so a screen built on this behaves exactly as written with Layer 5 absent.
 *
 * @param {string} screenKey e.g. 'hr.employee'
 * @param {{
 *   record: object,                     // useRecordForm's return
 *   customFields?: Array<object>,       // useCustomFields().fields
 *   customValues?: object,              // useCustomValues() — needs .values and .setValue
 *   canEdit?: boolean,
 * }} options
 */
export function useScreenHooks(screenKey, { record, customFields, customValues, canEdit = true } = {}) {
  const ui = useUi()

  /*
   * Fields a script asked to lock, e.g. onLoad returning
   *   return { readOnly: ['hra', 'netSalary'] }
   *
   * This greys the control out and nothing more. The API still accepts whatever is posted,
   * so a value that must never be typed has to be enforced on the server as well — a locked
   * input is a signpost, not a control.
   */
  const [lockedFields, setLockedFields] = useState([])

  /*
   * The caption a script asked to show under a control, e.g. an onChange returning
   *   return { hints: { address: '31 / 50' } }
   *
   * Held here rather than on the record because it is not part of what gets saved — it is
   * something a script wants said about a field while the field is being typed into.
   */
  const [fieldHints, setFieldHints] = useState({})

  // Everything a hook reads is mirrored into a ref, because a debounced onChange runs long
  // after the render that scheduled it and a captured value would already be stale — the
  // script would see the field as it was BEFORE the keystroke it is being told about.
  const formRef = useRef(record?.form)
  const customValuesRef = useRef(customValues?.values)
  const customKeysRef = useRef(new Set())
  const fieldsRef = useRef(customFields)
  const applyRef = useRef(null)

  useEffect(() => {
    formRef.current = record?.form
  }, [record?.form])

  useEffect(() => {
    customValuesRef.current = customValues?.values
  }, [customValues?.values])

  useEffect(() => {
    fieldsRef.current = customFields
    customKeysRef.current = new Set((customFields ?? []).map((f) => f.fieldKey))
  }, [customFields])

  /**
   * What every hook run is told.
   *
   * form and custom are separate bags on purpose: a tenant may name a Field Builder field
   * 'mobile', and merging the two would let it shadow the compiled field of that name. That
   * collision is silent — it surfaces as a wrong value on somebody's record, not as an error.
   */
  const contextFor = useCallback((fieldKey) => {
    const form = formRef.current ?? {}
    const custom = customValuesRef.current ?? {}
    const base = { form, custom }
    if (fieldKey === undefined) return base

    return {
      ...base,
      // Read from whichever bag owns the key, or a script on a custom field gets undefined.
      value: customKeysRef.current.has(fieldKey) ? custom[fieldKey] : form[fieldKey],
    }
  }, [])

  /** Acts on everything a result may carry. One place, so every slot honours the same contract. */
  const applyResult = useCallback(
    (result) => {
      if (!result || typeof result !== 'object') return result ?? {}

      if (result.form) record?.setForm?.((current) => ({ ...current, ...result.form }))
      if (Array.isArray(result.readOnly)) setLockedFields(result.readOnly)

      // Custom values go back one at a time through setValue rather than being merged
      // wholesale: setValue is what re-runs the formulas, so a script writing one field
      // still leaves every calculated field that reads it correct.
      if (result.custom && typeof result.custom === 'object' && customValues?.setValue) {
        const before = customValuesRef.current ?? {}
        for (const [key, value] of Object.entries(result.custom)) {
          if (before[key] !== value) customValues.setValue(key, value, fieldsRef.current)
        }
      }

      // hints and errors MERGE rather than replace: a script that says nothing about a field
      // must not wipe what another slot said about it. Writing '' to a key is how a script
      // takes its own hint or error back off again.
      if (result.hints && typeof result.hints === 'object') {
        setFieldHints((current) => ({ ...current, ...result.hints }))
      }

      // Marks the field the same way a failed save does, so a script's complaint and the
      // server's look alike. It does NOT stop a save — that is what beforeSave's cancelSave
      // is for, and a screen must not be able to be talked into saving by a stale error bag.
      if (result.errors && typeof result.errors === 'object') {
        record?.setErrors?.((current) => ({ ...current, ...result.errors }))
      }

      if (result.message) ui.toast(result.message)
      return result
    },
    // customValues is rebuilt each render; only setValue is used and it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [record?.setForm, record?.setErrors, customValues?.setValue, ui],
  )

  // Read through a ref by the timers below, so a pending onChange always applies the current
  // screen's result even if the callback identity has moved on since it was scheduled.
  useEffect(() => {
    applyRef.current = applyResult
  }, [applyResult])

  // ---------------------------------------------------------------
  // Screen-level slots
  // ---------------------------------------------------------------

  const onLoadFired = useRef(false)

  /** <screenKey>.onLoad — once, after the record is in hand. */
  useEffect(() => {
    if (!record || record.loading || onLoadFired.current) return
    onLoadFired.current = true
    runHook(`${screenKey}.onLoad`, contextFor()).then((result) => applyRef.current?.(result))
  }, [screenKey, record, record?.loading, contextFor])

  /**
   * <screenKey>.beforeSave — a script may stop the save outright.
   *
   * Returns the result rather than acting on cancelSave here: what "cancelled" means is the
   * screen's business — it may have a payload half-built, or fields to mark.
   */
  const beforeSave = useCallback(
    () => runHook(`${screenKey}.beforeSave`, contextFor()),
    [screenKey, contextFor],
  )

  /** <screenKey>.afterSave — the script decides where the user lands next. */
  const afterSave = useCallback(
    (payload, response) => runHook(`${screenKey}.afterSave`, { ...contextFor(), form: payload, response }),
    [screenKey, contextFor],
  )

  // ---------------------------------------------------------------
  // Per-field slots
  // ---------------------------------------------------------------

  // One pending onChange per field, so typing in one field does not cancel another's.
  const changeTimers = useRef(new Map())
  useEffect(() => {
    const timers = changeTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  /** <screenKey>.field.<fieldKey>.onBlur — once, when the control is left. */
  const onFieldBlur = useCallback(
    async (fieldKey) => {
      applyRef.current?.(await runHook(fieldHookKey(screenKey, fieldKey, 'onBlur'), contextFor(fieldKey)))
    },
    [screenKey, contextFor],
  )

  /**
   * <screenKey>.field.<fieldKey>.onChange — as the value is typed.
   *
   * Waits out the hook's own debounce_ms, and a fresh keystroke restarts the wait. Without
   * that a script runs once per letter, and one that calls api.query() would put a request on
   * the wire for every character.
   */
  const onFieldChange = useCallback(
    (fieldKey) => {
      const hookKey = fieldHookKey(screenKey, fieldKey, 'onChange')
      const timers = changeTimers.current

      clearTimeout(timers.get(fieldKey))
      timers.set(
        fieldKey,
        setTimeout(async () => {
          timers.delete(fieldKey)
          applyRef.current?.(await runHook(hookKey, contextFor(fieldKey)))
        }, hookDebounceMs(hookKey)),
      )
    },
    [screenKey, contextFor],
  )

  /**
   * Everything one compiled input needs: the value, the setter, and both field slots.
   *
   * record.bind is spread first so the handlers below replace its onChange rather than being
   * replaced by it — the bound setter still runs, with the hook scheduled after it.
   */
  const fieldProps = useCallback(
    (fieldKey, transform) => {
      const bound = record.bind(fieldKey, transform)
      return {
        ...bound,
        onBlur: () => onFieldBlur(fieldKey),
        onChange: (e) => {
          bound.onChange(e)
          onFieldChange(fieldKey)
        },
      }
    },
    [record, onFieldBlur, onFieldChange],
  )

  /** What a script asked to say under a control, or undefined so the screen's own hint stands. */
  const hint = useCallback((fieldKey) => fieldHints[fieldKey] || undefined, [fieldHints])

  /** The two reasons a control cannot be typed into: no edit permission, or a script said so. */
  const locked = useCallback(
    (fieldKey) => !canEdit || lockedFields.includes(fieldKey),
    [canEdit, lockedFields],
  )

  return {
    locked,
    lockedFields,
    hint,
    fieldHints,
    fieldProps,
    onFieldBlur,
    onFieldChange,
    beforeSave,
    afterSave,
    applyResult,
    contextFor,
  }
}
