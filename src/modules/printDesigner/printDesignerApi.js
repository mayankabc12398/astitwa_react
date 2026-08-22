import { api } from '../../core/api/client.js'

/**
 * The print designer's data layer. Every call the screen makes goes through here, so no
 * component holds a URL and the envelope is unwrapped in one place.
 */
export const printDesignerApi = {
  documentTypes: () => api.get('/hr/print-template/document-type'),

  /**
   * Templates for one document type. Paged like every list in this product; the designer
   * asks for a generous page because a tenant has a handful per document, not thousands.
   */
  templates: (documentType) =>
    api.get('/hr/print-template', { params: { documentType, page: 1, pageSize: 100 } }),

  template: (templateId) => api.get(`/hr/print-template/${templateId}`),

  /** What the designer may drop into a block for this document. */
  availableFields: (documentType) =>
    api.get('/hr/print-template/available-field', { params: { documentType } }),

  save: (template) => api.post('/hr/print-template', template),

  clone: (templateId, templateName) => api.post(`/hr/print-template/${templateId}/clone`, { templateName }),

  setDefault: (templateId) => api.post(`/hr/print-template/${templateId}/default`),

  remove: (templateId) => api.del(`/hr/print-template/${templateId}`),
}

export default printDesignerApi
