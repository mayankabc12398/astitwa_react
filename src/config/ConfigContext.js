import { createContext, useContext, useMemo } from 'react'

export const ConfigContext = createContext(null)

function useConfigContext() {
  const value = useContext(ConfigContext)
  if (!value) throw new Error('Configuration is used outside <ConfigProvider>.')
  return value
}

/** Whole bootstrap payload: tenant, menu, enabled modules, settings, field rules. */
export function useBootstrap() {
  return useConfigContext()
}

/** Layer 2 settings by key, with a typed read. */
export function useConfig() {
  const { settings } = useConfigContext()

  return useMemo(
    () => ({
      raw: settings,
      get: (key, fallback = null) => settings[key]?.value ?? fallback,
      getBool: (key, fallback = false) => {
        const raw = settings[key]?.value
        if (raw === undefined || raw === null || raw === '') return fallback
        return ['1', 'true', 'yes', 'y', 'on'].includes(String(raw).toLowerCase())
      },
      getInt: (key, fallback = 0) => {
        const parsed = Number.parseInt(settings[key]?.value ?? '', 10)
        return Number.isNaN(parsed) ? fallback : parsed
      },
      getJson: (key, fallback = null) => {
        const raw = settings[key]?.value
        if (!raw) return fallback
        try {
          return JSON.parse(raw)
        } catch {
          return fallback
        }
      },
    }),
    [settings],
  )
}

/**
 * Field rules for one screen, keyed by field. A field with no row falls back to
 * visible, optional, and the caption the screen declared.
 */
export function useFieldRules(screenKey) {
  const { fieldRules } = useConfigContext()

  return useMemo(() => {
    const forScreen = fieldRules[screenKey] ?? {}
    return {
      ruleFor: (fieldKey) => forScreen[fieldKey] ?? null,
      isVisible: (fieldKey) => forScreen[fieldKey]?.isVisible !== false,
      isRequired: (fieldKey) => forScreen[fieldKey]?.isRequired === true,
      labelFor: (fieldKey, fallback) => forScreen[fieldKey]?.label || fallback,
      seqFor: (fieldKey, fallback = 10) => forScreen[fieldKey]?.seqNo ?? fallback,
      all: forScreen,
    }
  }, [fieldRules, screenKey])
}

/** Whether an add-on is licensed for this tenant. Used to hide routes and menu entries. */
export function useEnabledModules() {
  const { enabledModules } = useConfigContext()
  return useMemo(() => {
    const set = new Set(enabledModules)
    return { list: enabledModules, has: (key) => set.has(key) }
  }, [enabledModules])
}
