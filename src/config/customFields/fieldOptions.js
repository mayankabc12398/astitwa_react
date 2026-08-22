import { useEffect, useState } from 'react'
import { api } from '../../core/api/client.js'

/**
 * Resolving the choices behind one custom field.
 *
 * Layer 2 owns this because two very different callers need the same answer: the control a
 * form renders, and the field builder's preview. A second implementation would be a second
 * chance for the two to disagree about what a dropdown contains.
 *
 * A static list, a built-in lookup and a named query are all resolved by the server. An
 * API-typed source cannot be — the server calling itself would drop the caller's identity —
 * so the server answers with the path from its own allowlist and the browser fetches it
 * with its own token.
 */
export async function resolveFieldOptions(field, { search, parentValue } = {}) {
  if (!field?.fieldId) return []

  // A typed-in list needs no round trip at all; it arrived with the definition.
  if (field.dataSourceType === 'Static') {
    const all = field.options ?? []
    if (!field.parentFieldKey) return all.map(toOption)

    if (parentValue === undefined || parentValue === null || parentValue === '') return []

    // An option with no parent value is shared across every parent, which is how every
    // option behaved before cascading existed.
    return all
      .filter((o) => !o.parentValue || String(o.parentValue) === String(parentValue))
      .map(toOption)
  }

  if (field.dataSourceType !== 'Lookup' && field.dataSourceType !== 'Dynamic') return []

  let result
  try {
    result = await api.get(`/hr/custom-field/${field.fieldId}/options`, { params: { search, parentValue } })
  } catch {
    // A list that cannot load leaves an empty dropdown; it never breaks the form.
    return []
  }

  if (!result?.resolveOnClient) return result?.options ?? []

  let params = {}
  try {
    params = result.staticParams ? JSON.parse(result.staticParams) : {}
  } catch {
    /* a malformed parameter blob must not stop the dropdown from loading */
  }

  if (search && result.searchParamName) params[result.searchParamName] = search
  if (result.parentFieldKey) params[result.parentParamName || 'parentValue'] = parentValue ?? ''

  let payload
  try {
    payload = await api.get(result.relativeUrl, { params })
  } catch {
    return []
  }

  return atPath(payload, result.resultPath)
    .map((row) => ({
      value: String(row[result.valueField] ?? ''),
      label: result.labelTemplate
        ? String(result.labelTemplate).replace(/\{(\w+)\}/g, (_m, k) => String(row[k] ?? ''))
        : String(row[result.labelField] ?? ''),
    }))
    .filter((o) => o.value !== '')
}

/**
 * The same resolution as a hook, for a control that renders a bound list.
 *
 * Keyed on the field and its parent value so a cascading list reloads when the field above
 * it changes, and so a stale list is never rendered as though it belonged to the new parent.
 */
export function useFieldOptions(field, parentValue) {
  const [loaded, setLoaded] = useState(null)

  const needsFetch = field?.dataSourceType === 'Lookup' || field?.dataSourceType === 'Dynamic'
  const key = `${field?.fieldId ?? 0}|${parentValue ?? ''}`

  useEffect(() => {
    if (!needsFetch) return undefined

    let cancelled = false
    resolveFieldOptions(field, { parentValue }).then((options) => {
      if (!cancelled) setLoaded({ key, options })
    })

    return () => {
      cancelled = true
    }
    // `field` is a definition object rebuilt on every fetch of the layout; keying on its id
    // and the parent value is what actually decides whether the list has to be re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsFetch])

  if (!needsFetch) {
    const all = field?.options ?? []
    if (!field?.parentFieldKey) return { options: all.map(toOption), busy: false }
    if (parentValue === undefined || parentValue === null || parentValue === '') return { options: [], busy: false }

    return {
      options: all
        .filter((o) => !o.parentValue || String(o.parentValue) === String(parentValue))
        .map(toOption),
      busy: false,
    }
  }

  return { options: loaded?.key === key ? loaded.options : [], busy: loaded?.key !== key }
}

const toOption = (o) => ({ value: o.optionValue, label: o.optionLabel || o.optionValue })

/** "data.items" against a payload; a blank path returns the payload itself. */
function atPath(payload, path) {
  const target = !path
    ? payload
    : String(path)
        .split('.')
        .filter(Boolean)
        .reduce((acc, key) => (acc == null ? acc : acc[key]), payload)

  if (Array.isArray(target)) return target
  if (Array.isArray(target?.items)) return target.items
  return []
}
