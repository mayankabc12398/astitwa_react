import { useEffect, useRef } from 'react'

/**
 * Focus-trapping dialog. Escape closes, focus returns to whatever opened it, and the
 * backdrop click is opt-in so a half-filled form is not lost by accident.
 */
export function Modal({ title, onClose, children, footer, narrow = false, closeOnBackdrop = true, labelledBy }) {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  /*
   * onClose is read through a ref so the effect below can depend on nothing.
   *
   * Callers write onClose={() => setThing(null)}, which is a new function on every render.
   * With onClose in the dependency list the whole effect tore down and re-ran on every
   * keystroke in the dialog — and re-running it moves focus to the first focusable element,
   * which is the header's close button. Typing anywhere in a dialog therefore jumped the
   * caret to the ✕ after each character.
   *
   * Opening focus belongs to the moment the dialog opens, so the effect now runs once.
   */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    previouslyFocused.current = document.activeElement

    const node = dialogRef.current
    const focusable = node?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    ;(focusable ?? node)?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !node) return

      const items = Array.from(
        node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.disabled && el.offsetParent !== null)
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused.current?.focus?.()
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className={narrow ? 'modal modal--narrow' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? 'modal-title'}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal__header">
          <h2 className="modal__title" id={labelledBy ?? 'modal-title'}>
            {title}
          </h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal__body">{children}</div>

        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
