import { api } from '../../core/api/client.js'

/**
 * The field builder's data layer.
 *
 * Every call the page makes goes through here, so the page never holds a URL and the
 * envelope is unwrapped in one place. The API already answers in camelCase, so unlike the
 * reference implementation there is no DTO translation layer to maintain — the shape the
 * server sends is the shape the page reads.
 */
export const fieldBuilderApi = {
  /** Screens that accept extra fields, from the server's compiled catalogue. */
  screens: () => api.get('/hr/custom-field/screen'),

  controlTypes: () => api.get('/hr/custom-field/control-type'),

  fields: (screenKey) => api.get('/hr/custom-field', { params: { screenKey } }),

  field: (fieldId) => api.get(`/hr/custom-field/${fieldId}`),

  usage: (fieldId) => api.get(`/hr/custom-field/${fieldId}/usage`),

  save: (field) => api.post('/hr/custom-field', field),

  remove: (fieldId) => api.del(`/hr/custom-field/${fieldId}`),

  reorder: (items) => api.post('/hr/custom-field/reorder', items),

  /** The allowlist a dropdown may bind to. Seeded server-side; never written from here. */
  dataSources: () => api.get('/hr/custom-field/data-source'),

  /**
   * "Test and load fields". A source the server can resolve comes back with real rows; an
   * API-typed one comes back as probeOnClient with the registered path, which this client
   * then fetches itself — it is the one holding the caller's token.
   */
  probe: async ({ sourceId, resultPath, search, parentValue }) => {
    const result = await api.post('/hr/custom-field/probe', { sourceId, resultPath, search, parentValue })
    if (!result?.probeOnClient) return result

    const rows = await fetchBound(result.relativeUrl, {})
    const list = atPath(rows, result.resultPath)

    return {
      ...result,
      columns: list.length ? Object.keys(list[0]) : [],
      rows: list.slice(0, 25),
      suggestedValueField: result.suggestedValueField || Object.keys(list[0] ?? {})[0] || '',
      suggestedLabelField: result.suggestedLabelField || Object.keys(list[0] ?? {})[1] || '',
    }
  },

  testFormula: (request) => api.post('/hr/custom-field/test-formula', request),

  audit: (screenKey, pageSize = 25) =>
    api.get('/hr/custom-field/audit', { params: { screenKey, page: 1, pageSize } }),

  archive: (fieldId, pageSize = 25) =>
    api.get('/hr/custom-field/archive', { params: { fieldId, page: 1, pageSize } }),

  values: (screenKey, recordId) => api.get('/hr/custom-field/value', { params: { screenKey, recordId } }),

  saveValues: (screenKey, recordId, values) =>
    api.post('/hr/custom-field/value', { screenKey, recordId, values }),

  /**
   * One field's options.
   *
   * A static list, a lookup and a named query are all resolved by the server. An API source
   * cannot be — the server calling itself would lose the caller's identity — so it answers
   * with the registered path and this fetches it.
   */
  options: async (field, search, parentValue) => {
    const result = await api.get(`/hr/custom-field/${field.fieldId}/options`, {
      params: { search, parentValue },
    })

    if (!result?.resolveOnClient) return result?.options ?? []

    let params = {}
    try {
      params = result.staticParams ? JSON.parse(result.staticParams) : {}
    } catch {
      /* a malformed parameter blob must not stop the dropdown from loading */
    }

    if (search && result.searchParamName) params[result.searchParamName] = search
    if (result.parentFieldKey) params[result.parentParamName || 'parentValue'] = parentValue ?? ''

    const payload = await fetchBound(result.relativeUrl, params)
    const list = atPath(payload, result.resultPath)

    return list
      .map((row) => ({
        value: String(row[result.valueField] ?? ''),
        label: result.labelTemplate
          ? String(result.labelTemplate).replace(/\{(\w+)\}/g, (_m, k) => String(row[k] ?? ''))
          : String(row[result.labelField] ?? ''),
      }))
      .filter((o) => o.value !== '')
  },
}

/**
 * Fetches a bound source through the app's own client, so the call carries the caller's
 * token. The path is the one the server handed back from its allowlist — never one this
 * module composed — which is what keeps a bound dropdown from becoming a way to reach an
 * arbitrary endpoint.
 */
async function fetchBound(relativeUrl, params) {
  if (!relativeUrl) return []
  try {
    return await api.get(relativeUrl, { params })
  } catch {
    return []
  }
}

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

export default fieldBuilderApi
