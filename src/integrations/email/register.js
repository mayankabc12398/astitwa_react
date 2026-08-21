import { registerRoutes } from '../../core/routing/routeRegistry.js'

/**
 * Layer 4 registration. Loaded only when the tenant has the SMTP integration enabled.
 *
 * An integration contributes a settings screen; the sending itself happens server-side
 * behind INotificationChannel, so no business screen ever knows this exists.
 */
registerRoutes([
  {
    path: '/admin/integrations/email',
    permission: 'admin.tenant',
    load: () => import('./EmailSettingsScreen.jsx'),
  },
])
