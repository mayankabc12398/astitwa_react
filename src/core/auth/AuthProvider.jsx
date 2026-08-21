import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client.js'
import { AuthContext } from './AuthContext.js'

/**
 * Holds the signed-in user for the session.
 *
 * The token lives in localStorage on the app's own origin. Client-side hook scripts run in a
 * sandboxed iframe with an opaque origin, so they cannot reach this storage — that is the
 * point of the sandbox (section 10.5).
 *
 * Permissions held here are for hiding controls only. The server checks them again on
 * every call; the client half is a courtesy, never the control.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading') // loading | signedOut | signedIn
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const signOut = useCallback(() => {
    setToken(null)
    setUser(null)
    setStatus('signedOut')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      if (mounted.current) {
        setUser(null)
        setStatus('signedOut')
      }
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  // Restore an existing session on a hard refresh.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      if (!getToken()) {
        if (!cancelled) setStatus('signedOut')
        return
      }
      try {
        const me = await api.get('/auth/me')
        if (cancelled) return
        setUser(me)
        setStatus('signedIn')
      } catch {
        if (cancelled) return
        setToken(null)
        setUser(null)
        setStatus('signedOut')
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async ({ tenantCode, userName, password }) => {
    const result = await api.post('/auth/login', { tenantCode, userName, password })
    setToken(result.token)
    setUser(result.user)
    setStatus('signedIn')
    return result.user
  }, [])

  const value = useMemo(() => {
    const permissions = new Set(user?.permissions ?? [])
    const roles = new Set(user?.roles ?? [])
    return {
      user,
      status,
      isSignedIn: status === 'signedIn',
      signIn,
      signOut,
      has: (permission) => (permission ? permissions.has(permission) : true),
      inRole: (role) => roles.has(role),
    }
  }, [user, status, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
