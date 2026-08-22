import { setHookEngine } from '../core/hooks/hookBridge.js'
import { registerRoutes } from '../core/routing/routeRegistry.js'
import { hookEngine } from './hookEngine.js'

/**
 * Layer 5 entry point.
 *
 * The engine pushes itself into the Layer 1 bridge here. Nothing under src/core/ or
 * src/modules/ imports this file — that direction is what the ESLint layer rule forbids —
 * so base code keeps working unchanged if this bundle never loads at all.
 */
setHookEngine(hookEngine)

registerRoutes([
  {
    path: '/admin/hooks',
    permission: 'admin.extensions',
    load: () => import('./adminScreens/ScriptHooksScreen.jsx'),
  },
  {
    path: '/admin/queries',
    permission: 'admin.extensions',
    load: () => import('./adminScreens/NamedQueriesScreen.jsx'),
  },
  {
    path: '/admin/apis',
    permission: 'admin.extensions',
    load: () => import('./adminScreens/CustomApiScreen.jsx'),
  },
  {
    path: '/admin/hook-log',
    permission: 'admin.extensions',
    load: () => import('./adminScreens/HookLogScreen.jsx'),
  },
])

/** Called by the app once the bootstrap payload is known. */
export function installClientScripts(scripts) {
  hookEngine.install(scripts ?? [])
}
