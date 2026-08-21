import { createContext, useContext } from 'react'

export const UiContext = createContext(null)

export function useUi() {
  const value = useContext(UiContext)
  if (!value) throw new Error('useUi must be used inside <UiProvider>.')
  return value
}

/*
 * A module-level handle on the same primitives, for callers that are not React components —
 * chiefly the hook engine, which services messages arriving from the sandbox iframe.
 * It is set by UiProvider on mount and cleared on unmount.
 */
let bridge = null

export function setUiBridge(value) {
  bridge = value
}

export function getUi() {
  if (!bridge) throw new Error('The UI primitives are not mounted yet.')
  return bridge
}
