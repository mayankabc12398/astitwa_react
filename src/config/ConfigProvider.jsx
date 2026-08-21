import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../core/api/client.js'
import { Alert, Loading } from '../core/controls/layout.jsx'
import { ConfigContext } from './ConfigContext.js'

const EMPTY = {
  tenantId: 0,
  tenantCode: '',
  tenantName: '',
  settings: {},
  fieldRules: {},
  menu: [],
  enabledModules: [],
  enabledIntegrations: [],
  clientHooks: [],
}

/**
 * Layer 2, client half.
 *
 * One call at start-up brings back everything that varies per tenant: settings, field
 * rules, the menu, the licensed add-ons and the client-side hook scripts. It is cached for
 * the session, so screens read configuration synchronously and no form has to wait.
 *
 * Changing behaviour for a client is a row in cfg_setting or cfg_field_rule plus a reload.
 * No build, no deploy.
 */
export function ConfigProvider({ children }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    api
      .get('/config/bootstrap', { signal: controller.signal })
      .then((payload) => {
        if (cancelled) return

        // Field rules arrive flat; index them by screen and field for O(1) reads in forms.
        const fieldRules = {}
        for (const rule of payload.fieldRules ?? []) {
          ;(fieldRules[rule.screenKey] ??= {})[rule.fieldKey] = rule
        }

        const settings = {}
        for (const setting of payload.settings ?? []) {
          settings[setting.key] = setting
        }

        setState({
          ...EMPTY,
          tenantId: payload.tenantId ?? 0,
          tenantCode: payload.tenantCode ?? '',
          tenantName: payload.tenantName ?? '',
          settings,
          fieldRules,
          menu: payload.menu ?? [],
          enabledModules: payload.enabledModules ?? [],
          enabledIntegrations: payload.enabledIntegrations ?? [],
          clientHooks: payload.clientHooks ?? [],
        })
      })
      .catch((cause) => {
        if (cancelled || cause?.name === 'AbortError') return
        setError(cause)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [attempt])

  /** Hard reload: clears what is on screen first. For the error path, where there is
   *  nothing worth keeping. */
  const reload = useCallback(() => {
    setState(null)
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  /**
   * Silent refresh: fetches again and swaps the payload in, leaving the current screen
   * mounted.
   *
   * This is what makes a configuration change take effect in the session that made it. A
   * newly saved hook script arrives in clientHooks, App.jsx sees a new array and reinstalls
   * the sandbox — so "Save and activate" activates, rather than meaning "activated for
   * whoever logs in next". Clearing state here instead would unmount the admin screen the
   * user is standing on.
   */
  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  const value = useMemo(
    () => (state ? { ...state, reload, refresh } : null),
    [state, reload, refresh],
  )

  if (error) {
    return (
      <div style={{ padding: 'var(--s-6)' }}>
        <Alert tone="error">
          Configuration could not be loaded. {error.message}
          {error.traceId ? ` (trace ${error.traceId})` : ''}
        </Alert>
        <button type="button" className="btn" onClick={reload}>
          Try again
        </button>
      </div>
    )
  }

  if (!value) return <Loading label="Loading configuration…" />

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}
