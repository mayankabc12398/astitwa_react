import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { PickListDialog } from './PickListDialog.jsx'
import { UiContext, setUiBridge } from './uiContext.js'

let nextToastId = 1

/**
 * Owns the five interaction primitives the product exposes: toast, error, confirm,
 * pickList and openScreen (section 10.4). Base screens use them through useUi();
 * Layer 5 scripts reach exactly the same implementations through the ui object the hook
 * engine hands them — the script supplies data, never markup.
 *
 * Deliberately five. A sixth needs a real requirement first.
 */
export function UiProvider({ children }) {
  const navigate = useNavigate()
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const [pickListState, setPickListState] = useState(null)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message, tone) => {
      const id = nextToastId++
      const text = String(message ?? '')
      setToasts((current) => [...current, { id, message: text, tone }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000),
      )
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const ui = useMemo(
    () => ({
      toast: (message) => push(message, 'ok'),
      error: (message) => push(message, 'error'),

      confirm: (messageOrOptions) => {
        const options =
          typeof messageOrOptions === 'string' ? { message: messageOrOptions } : (messageOrOptions ?? {})
        return new Promise((resolve) => {
          setConfirmState({
            ...options,
            onResolve: (answer) => {
              setConfirmState(null)
              resolve(Boolean(answer))
            },
          })
        })
      },

      pickList: (options = {}) =>
        new Promise((resolve) => {
          setPickListState({
            title: options.title ?? 'Select',
            columns: options.columns ?? [],
            rows: options.rows ?? [],
            emptyAction: options.emptyAction,
            onResolve: (row) => {
              setPickListState(null)
              resolve(row ?? null)
            },
          })
        }),

      openScreen: (route, options = {}) => {
        if (typeof route !== 'string' || !route.startsWith('/')) {
          push('openScreen needs an in-app path such as /hr/employee.', 'error')
          return false
        }
        navigate(route, { state: options.state, replace: Boolean(options.replace) })
        return true
      },
    }),
    [push, navigate],
  )

  // Lets non-React callers (the hook engine) reach the same primitives.
  useEffect(() => {
    setUiBridge(ui)
    return () => setUiBridge(null)
  }, [ui])

  return (
    <UiContext.Provider value={ui}>
      {children}

      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        ))}
      </div>

      {confirmState && <ConfirmDialog {...confirmState} />}
      {pickListState && <PickListDialog {...pickListState} />}
    </UiContext.Provider>
  )
}
