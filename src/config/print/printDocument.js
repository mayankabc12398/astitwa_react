import { BUILTIN_TEMPLATE, renderTemplate } from './templateRenderer.js'
import { api } from '../../core/api/client.js'

/**
 * Layer 2 — the print path.
 *
 * Renders into an off-screen iframe and opens the browser's own print dialogue. The text
 * stays vector, table headers repeat across pages, and page breaks land on row boundaries;
 * the reader's "Save as PDF" produces the file. Screenshotting the page would have given a
 * raster image with unselectable text and needed a new dependency for the privilege.
 *
 * The app shell is never involved, because the document is written into its own iframe
 * rather than captured from the live page.
 */
export function printTemplate(template, data = {}, options = {}) {
  const html = renderTemplate(template, data, { ...options, standalone: true })

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)

  const doc = frame.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  const fire = () => {
    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } finally {
      // The dialogue is modal but the iframe must outlive it, or Chrome prints a blank page.
      setTimeout(() => frame.remove(), 1000)
    }
  }

  if (doc.readyState === 'complete') setTimeout(fire, 60)
  else frame.onload = () => setTimeout(fire, 60)

  return true
}

/**
 * Flattens a document's print context into the key/value shape the renderer reads.
 *
 * Custom values are merged in under their own field keys, which is what lets a template
 * name a tenant-defined field exactly as it names a built-in one.
 */
export function contextToData(context) {
  const document_ = context?.document ?? {}
  const employee = context?.employee ?? {}

  const data = {
    ...employee,
    ...document_,
    employeeName: document_.employeeName || employee.employeeName || '',
    tenantName: context?.tenantName || '',
    printedOn: new Date().toLocaleString(),
  }

  for (const value of context?.customValues ?? []) {
    // A custom field never overwrites a built-in key: the field builder refuses a key that
    // collides with a compiled one, so a collision here would mean stale configuration.
    if (!(value.fieldKey in data)) data[value.fieldKey] = value.valueText ?? ''
  }

  return data
}

/**
 * Resolves the tenant's template for a document type.
 *
 * A tenant that has configured none gets the built-in layout rather than an error — that is
 * what keeps installing the designer from changing a single existing printout.
 */
export async function resolveTemplate(documentType) {
  try {
    return await api.get('/hr/print-template/resolve', { params: { documentType } })
  } catch {
    return BUILTIN_TEMPLATE
  }
}

/** Fetches the context, resolves the template and prints — the whole path in one call. */
export async function printDocumentById(documentId, options = {}) {
  const context = await api.get(`/hr/document/${documentId}/print`)
  const template = options.template ?? (await resolveTemplate(context.document.documentType))
  const data = contextToData(context)

  return printTemplate(template ?? BUILTIN_TEMPLATE, data, {
    title: context.document.subject || context.document.documentType,
    organisation: context.tenantName ?? '',
    printedOn: data.printedOn,
    ...options,
  })
}
