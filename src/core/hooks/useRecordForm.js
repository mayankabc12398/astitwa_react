import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { ApiError } from '../api/ApiError.js'

/**
 * Load-edit-save for a single record, shared by every form screen so the busy state,
 * the field-error binding and the "new vs existing" split are written once.
 *
 * Server-side validation is authoritative: field errors come back in the envelope and are
 * bound here. Client-side checks are for speed of feedback only (section 11).
 *
 * @param {{ path: string, id: string|undefined, blank: object, map?: (row: object) => object }} options
 */
export function useRecordForm({ path, id, blank, map }) {
  const isNew = !id || id === 'new'

  const [currentId, setCurrentId] = useState(id)
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Navigating from one record to another reuses this component. Resetting during render is
  // React's documented way to key state off a prop without wasting a commit.
  if (currentId !== id) {
    setCurrentId(id)
    setForm(blank)
    setErrors({})
    setMessage('')
    setLoadError(null)
    setLoading(!isNew)
  }

  useEffect(() => {
    if (isNew) return undefined

    const controller = new AbortController()
    let cancelled = false

    api
      .get(`${path}/${id}`, { signal: controller.signal })
      .then((row) => {
        if (cancelled) return
        setForm(map ? map(row) : { ...blank, ...row })
        setLoading(false)
      })
      .catch((cause) => {
        if (cancelled || cause?.name === 'AbortError') return
        setLoadError(cause)
        setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // `blank` and `map` are literals declared at module scope in every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, id, isNew])

  const setField = useCallback((key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const bind = useCallback(
    (key, transform = (e) => e.target.value) => ({
      value: form[key] ?? '',
      onChange: (e) => setField(key, transform(e)),
    }),
    [form, setField],
  )

  /**
   * @param {object} payload what to send; defaults to the current form
   * @returns {Promise<object|null>} the saved row, or null when the save failed
   */
  const save = useCallback(
    async (payload) => {
      setSaving(true)
      setErrors({})
      setMessage('')
      try {
        return await api.post(path, payload ?? form)
      } catch (cause) {
        if (cause instanceof ApiError) {
          setErrors(cause.fieldErrors)
          setMessage(cause.message)
        } else {
          setMessage('The record could not be saved.')
        }
        return null
      } finally {
        setSaving(false)
      }
    },
    [path, form],
  )

  return {
    isNew,
    form,
    setForm,
    setField,
    bind,
    save,
    errors,
    setErrors,
    message,
    setMessage,
    loading,
    saving,
    loadError,
  }
}
