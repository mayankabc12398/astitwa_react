import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'

const cache = new Map()

/**
 * Dropdown data. The procedures behind these endpoints are bounded, so there is no
 * unbounded select hiding behind a select box.
 *
 * A cache hit is read during render, so switching between screens that share a lookup shows
 * the options immediately rather than flashing an empty list for one frame.
 *
 * @param {string} path e.g. '/hr/department/lookup'
 * @param {boolean} [enabled]
 */
export function useLookup(path, enabled = true) {
  const [fetched, setFetched] = useState(null)
  const [attempt, setAttempt] = useState(0)

  const cached = cache.get(path)
  const options = cached ?? (fetched?.path === path ? fetched.options : null)

  useEffect(() => {
    if (!enabled || cache.has(path)) return undefined

    const controller = new AbortController()
    let cancelled = false

    api
      .get(path, { signal: controller.signal })
      .then((rows) => {
        const mapped = (rows ?? []).map((r) => ({ value: r.id, label: r.label }))
        cache.set(path, mapped)
        if (!cancelled) setFetched({ path, options: mapped })
      })
      .catch((cause) => {
        if (cancelled || cause?.name === 'AbortError') return
        // A lookup that cannot load leaves an empty dropdown; it never breaks the form.
        setFetched({ path, options: [] })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [path, enabled, attempt])

  const reload = useCallback(() => {
    cache.delete(path)
    setFetched(null)
    setAttempt((n) => n + 1)
  }, [path])

  return { options: options ?? [], busy: enabled && options === null, reload }
}

/** Call after a save so a newly added row shows up in dropdowns. */
export function invalidateLookup(path) {
  if (path) cache.delete(path)
  else cache.clear()
}
