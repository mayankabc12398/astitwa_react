import { registerRoutes } from '../../core/routing/routeRegistry.js'

/**
 * Layer 3 registration.
 *
 * This module is imported only when 'payroll' appears in the tenant's enabled-module list
 * (see src/registerLayers.js), and the screen behind it is a separate chunk again. A tenant
 * without Payroll therefore downloads neither — acceptance scenario 6.
 *
 * The route carries its moduleKey so the router filters it out even if this file were
 * somehow loaded, and the API enforces the same licence server-side with [RequireModule].
 */
registerRoutes([
  {
    path: '/payroll/runs',
    moduleKey: 'payroll',
    permission: 'payroll.view',
    load: () => import('./PayrollRunsScreen.jsx'),
  },
])
