/**
 * Layer 1 route registry.
 *
 * Base screens register themselves here directly. Add-ons and integrations register
 * themselves from their own folder by calling registerRoutes(), so no file under
 * src/core/ or src/modules/ ever imports src/addons/ — that import is what the ESLint
 * no-restricted-imports rule forbids.
 *
 * Every registered entry carries a lazy loader. The chunk is fetched only when the
 * route actually renders, so a tenant without Payroll never downloads Payroll code.
 */

const routes = []
const listeners = new Set()

/**
 * @typedef {Object} RouteEntry
 * @property {string} path          Router path, e.g. '/payroll/runs'
 * @property {() => Promise<any>} load  Dynamic import returning a module with a default export
 * @property {string|null} [moduleKey]  sys_tenant_module key; null means always available
 * @property {string|null} [permission] Permission required to see the route
 * @property {boolean} [index]          Render at the layout index
 */

/** @param {RouteEntry[]} entries */
export function registerRoutes(entries) {
  for (const entry of entries) {
    if (!entry?.path || typeof entry.load !== 'function') {
      throw new Error(`registerRoutes: entry needs a path and a load() function. Got ${JSON.stringify(entry)}`)
    }
    const existing = routes.findIndex((r) => r.path === entry.path)
    if (existing >= 0) routes[existing] = { moduleKey: null, permission: null, ...entry }
    else routes.push({ moduleKey: null, permission: null, ...entry })
  }
  listeners.forEach((fn) => fn(getRoutes()))
}

export function getRoutes() {
  return routes.slice()
}

/**
 * Routes this tenant may actually reach. Filtering happens here rather than in each
 * screen, so a disabled module cannot leak a route by omission.
 *
 * @param {{ enabledModules?: string[], permissions?: string[] }} access
 */
export function getRoutesFor({ enabledModules = [], permissions = [] } = {}) {
  const modules = new Set(enabledModules)
  const perms = new Set(permissions)
  return routes.filter((r) => {
    if (r.moduleKey && !modules.has(r.moduleKey)) return false
    if (r.permission && !perms.has(r.permission)) return false
    return true
  })
}

export function onRoutesChanged(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Test helper. Not used by the app. */
export function __resetRoutes() {
  routes.length = 0
}
