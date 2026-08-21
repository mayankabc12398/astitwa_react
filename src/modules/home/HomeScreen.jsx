import { Link } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Card, PageHeader } from '../../core/controls/layout.jsx'
import { useBootstrap } from '../../config/ConfigContext.js'

export default function HomeScreen() {
  const { user } = useAuth()
  const { menu, tenantName, enabledModules } = useBootstrap()

  return (
    <>
      <PageHeader title={`Welcome, ${user?.userName ?? ''}`} subtitle={tenantName} />

      <div className="form-grid">
        <Card>
          <h3>Screens</h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--s-5)' }}>
            {menu.map((m) => (
              <li key={m.key} style={{ marginBottom: 'var(--s-1)' }}>
                <Link to={m.route}>{m.label}</Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3>This tenant</h3>
          <p className="page-header__subtitle" style={{ marginBottom: 'var(--s-3)' }}>
            Add-ons licensed for {tenantName || user?.tenantCode}
          </p>
          {enabledModules.length === 0 ? (
            <p className="field__hint">No optional modules are enabled.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 'var(--s-5)' }}>
              {enabledModules.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
