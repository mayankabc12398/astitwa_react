import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

// Page header with breadcrumb, tinted icon tile, title, description, actions.
export function PageHeader({ icon, title, desc, tint = 'blue', crumbs = [], actions }) {
  return (
    <div>
      <nav className="breadcrumb">
        <Link to="/hr/dashboard" className="flex items-center gap-1"><Home size={12} /> Home</Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1" style={{ display: 'inline-flex' }}>
            <ChevronRight size={12} />
            {i === crumbs.length - 1 ? (
              <span className="crumb-current">{c.label ?? c}</span>
            ) : c.to ? (
              <Link to={c.to}>{c.label}</Link>
            ) : (
              <span>{c.label ?? c}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="page-header">
        <div className="page-head-main">
          {icon && (
            <div className="page-icon" style={{ background: `var(--tint-${tint})`, color: `var(--tint-${tint}-ink)` }}>
              {icon}
            </div>
          )}
          <div className="page-head-text">
            <h1 className="page-title">{title}</h1>
            {desc && <p className="page-desc">{desc}</p>}
          </div>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </div>
  );
}
