import { useEffect, useState } from 'react'
import { api } from '../../core/api/client.js'

/**
 * Resolves the template a tenant has configured for a document type.
 *
 * `template` stays null when they have configured none — the renderer then falls back to its
 * built-in layout, so a caller never has to check. That is what keeps installing the
 * designer from changing a single existing printout.
 *
 * In its own module so TemplatePreview.jsx exports components only; a file that mixes the
 * two loses fast refresh for every component in it.
 */
export function useResolvedTemplate(documentType) {
  const [loaded, setLoaded] = useState(null)

  useEffect(() => {
    if (!documentType) return undefined

    let alive = true

    api
      .get('/hr/print-template/resolve', { params: { documentType } })
      .then((template) => {
        if (alive) setLoaded({ documentType, template })
      })
      .catch(() => {
        // A 404 is the documented answer for "nothing configured", and a template that
        // cannot be fetched must not blank the screen. Either way the built-in layout
        // still renders the document.
        if (alive) setLoaded({ documentType, template: null })
      })

    return () => {
      alive = false
    }
  }, [documentType])

  // Derived rather than cleared in the effect: with no document type there is nothing to
  // wait for, and a template fetched for a previous type is never reported as this one's.
  return {
    template: loaded?.documentType === documentType ? loaded.template : null,
    ready: !documentType || loaded?.documentType === documentType,
  }
}
