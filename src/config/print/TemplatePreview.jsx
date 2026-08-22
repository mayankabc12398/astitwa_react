import { useEffect, useMemo, useRef, useState } from 'react'
import { BUILTIN_TEMPLATE, pageDimensions, previewCss, renderPreview, SCOPE_CLASS } from './templateRenderer.js'
import { useResolvedTemplate } from './useResolvedTemplate.js'

/**
 * A document on screen, as its configured template will print it.
 *
 * Every screen that previewed a letter used to draw its own version of the page with its own
 * fonts and rules, which is how a screen could show one thing and print another. This goes
 * through the same render the print path calls, so the preview is the document.
 */

/**
 * @param {{
 *   documentType: string,
 *   data: object,
 *   options?: object,
 *   style?: object,
 * }} props
 */
export function TemplatePreview({ documentType, data, options, style }) {
  const { template, ready } = useResolvedTemplate(documentType)

  const hostRef = useRef(null)
  const pageRef = useRef(null)
  const styleRef = useRef(null)

  const [scale, setScale] = useState(1)
  const [pageHeight, setPageHeight] = useState(0)

  const effective = template ?? BUILTIN_TEMPLATE
  const css = useMemo(() => previewCss(effective), [effective])
  const html = useMemo(
    () => (ready ? renderPreview(effective, data, { ...options, standalone: false }) : ''),
    [ready, effective, data, options],
  )

  // One <style> element for the life of the preview, rewritten in place. The stylesheet is
  // built in scoped mode, so none of it can reach the screen around it.
  useEffect(() => {
    const node = document.createElement('style')
    node.setAttribute('data-template-preview', 'true')
    document.head.appendChild(node)
    styleRef.current = node

    return () => {
      node.remove()
      styleRef.current = null
    }
  }, [])

  useEffect(() => {
    if (styleRef.current) styleRef.current.textContent = css
  }, [css])

  // The rendered page is a real page box in millimetres, which is wider than any drawer.
  // Scale it down to whatever width it has been given.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !ready) return undefined

    const dim = pageDimensions(effective)
    const pageWidthPx = (dim.width * 96) / 25.4

    const fit = () => {
      const available = host.clientWidth
      if (available > 0) setScale(Math.min(1, available / pageWidthPx))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    return () => observer.disconnect()
  }, [effective, ready])

  // A CSS transform does not change layout height, so without this the wrapper would still
  // reserve the full unscaled page and leave a tall gap below the letter.
  useEffect(() => {
    const page = pageRef.current
    if (!page) return undefined

    const measure = () => setPageHeight(page.scrollHeight)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(page)
    return () => observer.disconnect()
  }, [html])

  if (!ready) return <div className="skeleton" style={{ height: 320, borderRadius: 12 }} />

  const scope = SCOPE_CLASS.replace('.', '')

  return (
    <div ref={hostRef} style={{ width: '100%', ...style }}>
      <div style={{ height: Math.round(pageHeight * scale), overflow: 'hidden' }}>
        <div
          ref={pageRef}
          className={scope}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: '1px solid var(--border)',
            borderRadius: 4,
            boxShadow: '0 1px 3px rgba(16,24,40,.07)',
          }}
          // Produced entirely by the renderer from validated template values; the only
          // unescaped parts are the administrator's own header, footer and standing copy.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

export default TemplatePreview
