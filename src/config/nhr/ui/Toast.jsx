import { useMemo } from 'react'
import { useUi } from '../../../core/controls/uiContext.js'

/**
 * Toast shim for the ported pages.
 *
 * The source module delegated to its host app's toast helper; here it delegates to
 * Astitwa's own UiProvider, so a message raised by one of these screens looks and behaves
 * exactly like one raised anywhere else in the product. The useToast() surface is kept
 * unchanged so the ported pages need no edit.
 *
 * There is no ToastProvider of its own on purpose: a second toast stack would be a second
 * place for a message to appear, and the five UI primitives are deliberately five.
 */
export function useToast() {
  const ui = useUi()

  return useMemo(() => {
    const join = (title, desc) => (desc ? `${title} — ${desc}` : title)

    return {
      success: (title, desc) => ui.toast(join(title, desc)),
      info: (title, desc) => ui.toast(join(title, desc)),
      warning: (title, desc) => ui.error(join(title, desc)),
      error: (title, desc) => ui.error(join(title, desc)),
    }
  }, [ui])
}

// The source also exported a ToastProvider. There is none here: UiProvider is already
// mounted above every screen, so a second provider would only be a second thing to forget.
