import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}

/** Convenience for gating a control on a permission the server also checks. */
export function usePermission(permission) {
  const { has } = useAuth()
  return has(permission)
}
