import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// KPI card with pastel icon tile, delta arrow and soft corner glow.
// tint: one of blue|cyan|mint|lavender|peach|pink|lemon|indigo|green|orange|sky|rose
export function MetricCard({ label, value, delta, deltaLabel = 'vs last month', tint = 'blue', icon, footer, onClick }) {
  const up = typeof delta === 'number' && delta > 0;
  const down = typeof delta === 'number' && delta < 0;
  return (
    <div className="metric-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="metric-glow" style={{ background: `var(--tint-${tint})` }} />
      <div className="flex items-start justify-between gap-3" style={{ position: 'relative' }}>
        <div className="flex-1">
          <div className="metric-label">{label}</div>
          <div className="metric-value">{value}</div>
          {delta != null && (
            <div className="metric-delta" style={{ color: up ? 'var(--success-ink)' : down ? 'var(--danger-ink)' : 'var(--text-3)' }}>
              {up ? <TrendingUp size={13} /> : down ? <TrendingDown size={13} /> : <Minus size={13} />}
              {typeof delta === 'number' ? `${Math.abs(delta)}%` : delta}
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{deltaLabel}</span>
            </div>
          )}
          {footer && <div className="t-sm ink-3 mt-2">{footer}</div>}
        </div>
        {icon && (
          <div className="metric-icon" style={{ background: `var(--tint-${tint})`, color: `var(--tint-${tint}-ink)` }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
