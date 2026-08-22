// Underline tabs + segmented control.
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => {
        const key = t.key ?? t;
        const isActive = key === active;
        return (
          <button key={key} type="button" className={`tab ${isActive ? 'active' : ''}`} onClick={() => onChange(key)}>
            {t.icon}
            {t.label ?? t}
            {t.count != null && <span className="tab-count">{t.count}</span>}
            {isActive && <span className="tab-indicator" />}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange, size }) {
  return (
    <div className="segmented" style={size === 'sm' ? { padding: 2 } : undefined}>
      {options.map((o) => {
        const key = o.value ?? o;
        return (
          <button key={key} type="button" className={key === value ? 'active' : ''} onClick={() => onChange(key)} title={o.title}>
            {o.icon}
            {o.label ?? (typeof o === 'string' ? o : null)}
          </button>
        );
      })}
    </div>
  );
}
