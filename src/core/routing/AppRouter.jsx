import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import { Alert, Loading } from '../controls/layout.jsx'
import { AppShell } from '../layout/AppShell.jsx'
import { getRoutesFor, onRoutesChanged } from './routeRegistry.js'

const cache = new Map()

/** One lazy component per registered path, memoised so navigation does not refetch. */
function componentFor(entry) {
  if (!cache.has(entry.path)) cache.set(entry.path, lazy(entry.load))
  return cache.get(entry.path)
}

export function AppRouter({ enabledModules }) {
  const { user } = useAuth()
  const [version, setVersion] = useState(0)

  // Add-ons register asynchronously; re-render when the registry changes.
  useEffect(() => onRoutesChanged(() => setVersion((v) => v + 1)), [])

  const routes = useMemo(
    () => getRoutesFor({ enabledModules, permissions: user?.permissions ?? [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabledModules, user, version],
  )

  return (
    <Routes>
      <Route element={<AppShell />}>
        {routes.map((entry) => {
          const Screen = componentFor(entry)
          return (
            <Route
              key={entry.path}
              path={entry.path}
              element={
                <Suspense fallback={<Loading />}>
                  <Screen />
                </Suspense>
              }
            />
          )
        })}

        <Route
          path="*"
          element={
            <Alert tone="warn">
              That screen is not available. It may belong to a module this tenant does not have, or you may not
              have permission for it.
            </Alert>
          }
        />
      </Route>

      <Route path="/signin" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
