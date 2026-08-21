/**
 * The composition root for layers 3, 4 and 5 — the client-side twin of the plugin loader in
 * HrSuite.API.
 *
 * This file lives outside src/core/ and src/modules/ on purpose. It is the ONLY module
 * allowed to name an add-on, an integration or the extension engine; the ESLint
 * no-restricted-imports rule forbids that everywhere in Layer 1.
 *
 * Every import here is dynamic and gated on what the tenant is licensed for, so a tenant
 * without Payroll never downloads the Payroll chunk (acceptance scenario 6).
 */

const ADDONS = {
  payroll: () => import('./addons/payroll/register.js'),
}

const INTEGRATIONS = {
  'email.smtp': () => import('./integrations/email/register.js'),
}

export async function registerUpperLayers({ enabledModules = [], enabledIntegrations = [], clientHooks = [] } = {}) {
  // Layer 5 is always present: it is the engine, not a licensed module. Individual
  // scripts are the licensed unit, and those are rows.
  const extensions = await import('./extensions/register.js')
  extensions.installClientScripts(clientHooks)

  await Promise.all(
    enabledModules.map(async (key) => {
      const load = ADDONS[key]
      if (!load) return
      await load()
    }),
  )

  await Promise.all(
    enabledIntegrations.map(async (key) => {
      const load = INTEGRATIONS[key]
      if (!load) return
      await load()
    }),
  )
}
