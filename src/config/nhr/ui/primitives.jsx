// Small shared primitives: Avatar, Badge, Chip, EmptyState, Skeleton,
// Detail rows, Accordion, ProgressBar, Dropdown menu.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Inbox } from 'lucide-react';
import { initials, statusTone } from '../format.js';
// Dropdown below closes itself from its own repositioning effect, which already listens on
// mousedown, so the shared useClickOutside hook the source imported here was never called.

// Avatar gradient palette (presentation constant, index = avatarHue 0-11)
const AVATAR_HUES = [
  ['#6672f1', '#818cf8'], ['#0ea5b7', '#38bdf8'], ['#10a56b', '#34d399'],
  ['#8455e0', '#a78bfa'], ['#d97706', '#fbbf24'], ['#dc4a6b', '#fb7185'],
  ['#c03579', '#f472b6'], ['#4f46e5', '#8b9cf8'], ['#0b6fae', '#7dd3fc'],
  ['#b26205', '#fdba74'], ['#197a2c', '#86efac'], ['#6d3fd1', '#c4b5fd'],
];

export function Avatar({ name, hue = 0, size = 'md', ring = false, src }) {
  const [from, to] = AVATAR_HUES[hue % AVATAR_HUES.length];
  return (
    <span
      className={`avatar avatar-${size} ${ring ? 'avatar-ring' : ''}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      title={name}
    >
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : initials(name)}
    </span>
  );
}

export function StatusBadge({ status, tone }) {
  const t = tone || statusTone(status);
  return (
    <span className={`badge badge-${t}`}>
      <span className="dot" />
      {status}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Chip({ active, onClick, children, onRemove }) {
  return (
    <button type="button" className={`chip ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
      {onRemove && (
        <span className="chip-x" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</span>
      )}
    </button>
  );
}

export function EmptyState({ icon, title = 'Nothing here yet', desc, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <Inbox size={26} />}</div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 14, r, style }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkeletonRows({ rows = 5, height = 44 }) {
  return (
    <div className="flex-col gap-2" style={{ padding: 16 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={height} style={{ opacity: 1 - i * 0.13 }} />
      ))}
    </div>
  );
}

export function ProgressBar({ value = 0, color = 'var(--primary)', height = 7 }) {
  return (
    <div className="progress-track" style={{ height }}>
      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

export function DetailRow({ label, value, children }) {
  return (
    <div className="detail-row">
      <span className="detail-key">{label}</span>
      <span className="detail-val">{children ?? value ?? '—'}</span>
    </div>
  );
}

export function Accordion({ title, badge, icon, tone, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`accordion-item${tone ? ' accordion-tinted' : ''}`}
      style={tone ? { '--acc-tint': `var(--tint-${tone})`, '--acc-ink': `var(--tint-${tone}-ink)` } : undefined}
    >
      <button type="button" className="accordion-head" onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-2">
          {icon && <span className="accordion-ico">{icon}</span>}
          {title}
          {badge}
        </span>
        <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur) var(--ease)', color: 'var(--text-3)' }} />
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

// Dropdown action menu — trigger renders children; items = [{label, icon, onClick, danger, sep}]
export function Dropdown({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const toggle = (e) => {
    e.stopPropagation();
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const estHeight = Math.min(items.length * 36 + 12, 320);
      const gap = 6;
      const menuW = 200;
      // attach directly under the trigger; flip above only when there's truly
      // no room below (keeps the menu glued to the button — no big gap)
      let top = rect.bottom + gap;
      if (top + estHeight > window.innerHeight - 8 && rect.top - estHeight - gap > 8) {
        top = rect.top - estHeight - gap;
      }
      let left = align === 'left' ? rect.left : rect.right - menuW;
      left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
      setPos({ top, left });
    }
    setOpen((o) => !o);
  };

  // Fixed-positioned menu escapes the table-wrap's overflow:hidden; keep it
  // glued to the trigger while the user scrolls / resizes.
  useEffect(() => {
    if (!open || !ref.current) return undefined;
    const reposition = () => {
      const rect = ref.current.getBoundingClientRect();
      const estHeight = Math.min(items.length * 36 + 12, 320);
      const gap = 6;
      const menuW = 200;
      // attach directly under the trigger; flip above only when there's truly
      // no room below (keeps the menu glued to the button — no big gap)
      let top = rect.bottom + gap;
      if (top + estHeight > window.innerHeight - 8 && rect.top - estHeight - gap > 8) {
        top = rect.top - estHeight - gap;
      }
      let left = align === 'left' ? rect.left : rect.right - menuW;
      left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
      setPos({ top, left });
    };
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    reposition();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, align, items.length]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span onClick={toggle}>{trigger}</span>
      {open && pos && createPortal(
        <div className="nhr-scope nhr-portal-layer">
          <div ref={menuRef} className="menu-pop" style={{ position: 'fixed', zIndex: 1000, top: pos.top, left: pos.left }}>
            {items.map((it, i) =>
              it.sep ? (
                <div key={i} className="menu-sep" />
              ) : it.label2 ? (
                <div key={i} className="menu-label">{it.label2}</div>
              ) : (
                <button
                  key={i}
                  type="button"
                  className={`menu-item ${it.danger ? 'danger' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick?.(); }}
                >
                  {it.icon}
                  {it.label}
                </button>
              )
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function Timeline({ items }) {
  return (
    <div className="timeline">
      {items.map((it, i) => (
        <div key={i} className="timeline-item" style={{ animationDelay: `${i * 60}ms` }}>
          <span className="timeline-dot" style={{ background: it.color || 'var(--primary)' }} />
          <div className="timeline-title">{it.title}</div>
          {it.time && <div className="timeline-time">{it.time}</div>}
          {it.desc && <div className="timeline-desc">{it.desc}</div>}
        </div>
      ))}
    </div>
  );
}

export function Stepper({ steps, current, onStepClick, jumpAll = false }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => {
        // completed steps become clickable when a handler is supplied —
        // jumping back never skips validation (forward still goes via Continue).
        // jumpAll makes every step clickable (edit flows, record already complete).
        const clickable = !!onStepClick && (jumpAll ? i !== current : i < current);
        return (
          <div
            key={i}
            className={`step ${i < current ? 'done' : ''} ${i === current ? 'current' : ''}`}
            style={{ flex: i === steps.length - 1 ? '0 0 auto' : 1, cursor: clickable ? 'pointer' : undefined }}
            title={clickable ? `Go to ${s.title || s}` : undefined}
            onClick={clickable ? () => onStepClick(i) : undefined}
          >
            <span className="step-dot">{i < current ? '✓' : i + 1}</span>
            <span className="step-meta hide-sm">
              <span className="step-title">{s.title || s}</span>
              {s.sub && <div className="step-sub">{s.sub}</div>}
            </span>
            {i < steps.length - 1 && <span className="step-line" />}
          </div>
        );
      })}
    </div>
  );
}
