export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions}
    </header>
  )
}

export function Card({ children, className = '' }) {
  return <section className={`card ${className}`.trim()}>{children}</section>
}

export function Alert({ tone = 'info', children }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Badge({ tone = 'muted', children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', padding: 'var(--s-5)' }}>
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
