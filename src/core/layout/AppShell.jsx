import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import { Button } from '../controls/Button.jsx'
import { useBootstrap } from '../../config/ConfigContext.js'

/**
 * The frame every signed-in screen renders inside.
 *
 * The navigation is not hardcoded: it is whatever the bootstrap call returned for this
 * tenant, already filtered by enabled module and by permission on the server. An add-on
 * that is switched off simply is not in the list, so this file never mentions one.
 */
export function AppShell() {
  const { user, signOut } = useAuth()
  const { menu, tenantName } = useBootstrap()

  // Grouped by what an entry IS, not by a list of known prefixes: an entry contributed by a
  // layer this file has never heard of still appears, rather than vanishing silently.
  const groups = []
  const seen = new Set()

  const take = (heading, predicate) => {
    const items = menu.filter((m) => !seen.has(m.key) && predicate(m))
    items.forEach((m) => seen.add(m.key))
    if (items.length > 0) groups.push({ heading, items })
  }

  take('HR', (m) => !m.moduleKey && m.key.startsWith('hr.'))
  take('Modules', (m) => Boolean(m.moduleKey))
  take('Administration', (m) => m.key.startsWith('admin.'))
  take('Other', () => true)

  return (
    <div className="app">
      <div className="app__brand">Demo Hospital</div>

      <header className="app__header">
        <span className="app__tenant">{tenantName || user?.tenantCode}</span>
        <span className="app__header-spacer" />
        <span className="app__user">{user?.userName}</span>
        <Button size="sm" onClick={signOut}>
          Sign out
        </Button>
      </header>

      <nav className="app__nav" aria-label="Main">
        {groups.map((group) => (
          <div className="app__nav-group" key={group.heading}>
            <div className="app__nav-heading">{group.heading}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.key}
                to={item.route}
                end={item.route.split('/').length <= 3}
                className={({ isActive }) => `app__nav-link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <main className="app__main">
        <Outlet />
      </main>
    </div>
  )
}
