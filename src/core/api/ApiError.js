/**
 * The client-side shape of the server's error envelope. Every failed call throws one of
 * these, so no screen has to inspect a raw Response.
 */
export class ApiError extends Error {
  constructor({ status, code, message, fields = [], traceId = '' }) {
    super(message || 'The request failed.')
    this.name = 'ApiError'
    this.status = status
    this.code = code || 'UNEXPECTED'
    this.fields = fields
    this.traceId = traceId
  }

  /** Field-level messages keyed by field name, for form binding. */
  get fieldErrors() {
    const map = {}
    for (const f of this.fields) {
      if (f?.field) map[f.field] = f.message
    }
    return map
  }

  get isValidation() {
    return this.code === 'VALIDATION_FAILED'
  }

  get isForbidden() {
    return this.code === 'FORBIDDEN' || this.code === 'MODULE_DISABLED'
  }

  get isUnauthorized() {
    return this.code === 'UNAUTHORIZED' || this.status === 401
  }
}
