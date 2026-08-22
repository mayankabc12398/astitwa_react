import { api } from '../../core/api/client.js'

/**
 * The Documents Center's data layer. Every call the screen makes goes through here, so no
 * component holds a URL and the envelope is unwrapped in one place.
 */
export const documentsApi = {
  /**
   * The register, one page at a time. The table drives this: search, paging and the status
   * filter are the server's job, because the register grows without limit.
   */
  list: ({ page = 1, pageSize = 10, search, status, employeeId } = {}) =>
    api.get('/hr/document', { params: { page, pageSize, search, status, employeeId } }),

  /** Counts across the whole register — what a page of rows cannot tell you. */
  stats: () => api.get('/hr/document/stats'),

  get: (documentId) => api.get(`/hr/document/${documentId}`),

  printContext: (documentId) => api.get(`/hr/document/${documentId}/print`),

  save: (document) => api.post('/hr/document', document),

  setStatus: (documentId, status, extra = {}) =>
    api.post(`/hr/document/${documentId}/status`, { status, ...extra }),

  remove: (documentId) => api.del(`/hr/document/${documentId}`),

  documentTypes: () => api.get('/hr/print-template/document-type'),

  templates: (documentType) => api.get('/hr/print-template/lookup', { params: { documentType } }),

  employees: () => api.get('/hr/employee/lookup'),
}

export default documentsApi
