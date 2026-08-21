import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './core/auth/AuthProvider.jsx'
import { useAuth } from './core/auth/AuthContext.js'
import { SignInScreen } from './core/auth/SignInScreen.jsx'
import { UiProvider } from './core/controls/UiProvider.jsx'
import { Loading } from './core/controls/layout.jsx'
import { AppRouter } from './core/routing/AppRouter.jsx'
import { registerBaseRoutes } from './core/routing/baseRoutes.js'
import { ConfigProvider } from './config/ConfigProvider.jsx'
import { useBootstrap } from './config/ConfigContext.js'
import { registerUpperLayers } from './registerLayers.js'
import './core/styles/controls.css'
import './core/styles/layout.css'

registerBaseRoutes()

/**
 * Loads layers 3, 4 and 5 for this tenant, then renders the router.
 * Nothing under src/core/ or src/modules/ takes part in this — see registerLayers.js.
 */
function LayeredApp() {
  const { enabledModules, enabledIntegrations, clientHooks } = useBootstrap()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    registerUpperLayers({ enabledModules, enabledIntegrations, clientHooks })
      .catch(() => {
        // A broken upper layer must not stop base code from working.
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [enabledModules, enabledIntegrations, clientHooks])

  if (!ready) return <Loading label="Loading modules…" />

  return <AppRouter enabledModules={enabledModules} />
}

function AuthenticatedApp() {
  const { status, isSignedIn } = useAuth()

  if (status === 'loading') return <Loading label="Signing in…" />
  if (!isSignedIn) return <SignInScreen />

  return (
    <ConfigProvider>
      <UiProvider>
        <LayeredApp />
      </UiProvider>
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </BrowserRouter>
  )
}
