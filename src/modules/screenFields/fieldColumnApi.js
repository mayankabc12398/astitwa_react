import { api } from '../../core/api/client.js'

/**
 * The Screen Field Builder that writes real columns.
 *
 * Distinct from fieldBuilderApi.js on purpose: that one configures fields whose values are
 * stored as rows, this one configures fields that ARE columns on the screen's own table. The
 * two answer the same question for different prices, and mixing their clients would hide
 * which price a given screen is paying.
 */

/** Layouts are read by every form that draws these fields; a layout changes only when an admin edits it. */
const layouts = new Map()

export function invalidateScreenLayout(screenCode) {
  if (screenCode) layouts.delete(screenCode)
  else layouts.clear()
}

export const fieldColumnApi = {
  screens: () => api.get('/hr/field-column/screen'),

  controlTypes: () => api.get('/hr/field-column/control-type'),

  layout: async (screenCode, { fresh = false } = {}) => {
    if (!fresh && layouts.has(screenCode)) return layouts.get(screenCode)
    const layout = await api.get(`/hr/field-column/screen/${screenCode}/layout`)
    layouts.set(screenCode, layout)
    return layout
  },

  saveField: async (screenCode, field) => {
    const saved = await api.post(`/hr/field-column/screen/${screenCode}/field`, field)
    invalidateScreenLayout(screenCode)
    return saved
  },

  /**
   * The column name travels with the id because the server insists on it: a delete that needs
   * only an id is one stale browser tab away from dropping the wrong column.
   */
  deleteField: async (screenCode, fieldId, columnName) => {
    const result = await api.del(`/hr/field-column/field/${fieldId}?column=${encodeURIComponent(columnName)}`)
    invalidateScreenLayout(screenCode)
    return result
  },

  reorder: async (screenCode, items) => {
    const result = await api.post('/hr/field-column/reorder', items)
    invalidateScreenLayout(screenCode)
    return result
  },

  audit: (screenCode) => api.get('/hr/field-column/audit', { params: { screenCode } }),
}

export const requisitionApi = {
  get: (id) => api.get(`/hr/job-requisition/${id}`),
  save: (requisition) => api.post('/hr/job-requisition', requisition),
  remove: (id) => api.del(`/hr/job-requisition/${id}`),
}

/** The blank a new field starts from. */
export const BLANK_FIELD = {
  fieldId: 0,
  label: '',
  columnName: '',
  controlType: 'text',
  isRequired: false,
  width: 'half',
  stepIndex: 0,
  afterFieldId: 0,
  placeholder: '',
  defaultValue: '',
  rangeMin: '',
  rangeMax: '',
  maxLength: '',
  helpText: '',
  dataSourceType: 'None',
  showInForm: true,
  showInDetail: true,
  showInPrint: true,
  options: [],
}

/** cf_ is added by the server too; showing it here means the author sees the real column name. */
export const slugColumn = (label) => {
  const slug = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 58)
  return `cf_${slug || 'field'}`
}

export default fieldColumnApi
