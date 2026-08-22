// Form controls: Field wrapper, inputs, floating labels, searchable
// select, tag input, switch field. All controlled components.
import { forwardRef, useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, ChevronLeft, ChevronRight, X, AlertCircle, Check, Calendar } from 'lucide-react';
import { fmtDate } from '../format.js';

// Popover menu rendered into a body portal so it can never be clipped by a
// modal/drawer/overflow ancestor. Positions itself under the anchor with
// fixed coords, flips above when there isn't room below, clamps to the
// viewport, and closes on outside click / scroll-away / Escape.
function PortalMenu({ open, onClose, anchorRef, width, className = 'menu-pop', style, children }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const w = width || r.width;
      const gap = 6;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, (openUp ? spaceAbove : spaceBelow));
      setPos(openUp
        ? { position: 'fixed', left, width: w, minWidth: w, bottom: window.innerHeight - r.top + gap, maxHeight }
        : { position: 'fixed', left, width: w, minWidth: w, top: r.bottom + gap, maxHeight });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, width, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;
  // The portal lands on <body>, OUTSIDE the .nhr-scope subtree, so the outer
  // wrapper re-establishes .nhr-scope — otherwise the scoped selectors AND the
  // design tokens (--primary, --surface, grid rules…) don't apply and the menu
  // collapses to unstyled inline boxes. `nhr-portal-layer` strips the app-shell
  // box that .nhr-scope carries (height:100% + page background) — without it the
  // wrapper is a full-viewport grey block and the menu renders at ITS top, far
  // from the anchor. Positioning lives on the wrapper; the inner div is the
  // actual styled/scrollable menu, kept in flow (position: relative) so the
  // wrapper hugs it and bottom-anchoring (flip-up) lands correctly.
  const { maxHeight, ...box } = pos;
  // A caller-supplied maxHeight is a cap, not an override — the viewport-derived
  // one still wins when it is tighter, so the menu never runs off screen.
  const cap = style && style.maxHeight ? Math.min(maxHeight, style.maxHeight) : maxHeight;
  return createPortal(
    <div className="nhr-scope nhr-portal-layer" style={{ zIndex: 4000, ...box }}>
      <div ref={menuRef} className={className} style={{ position: 'relative', overflowY: 'auto', width: '100%', ...style, maxHeight: cap }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, required, help, error, children }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label">
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {help && !error && <span className="field-help">{help}</span>}
      {error && (
        <span className="field-error"><AlertCircle size={12} /> {error}</span>
      )}
    </div>
  );
}

export function Input({ invalid, type, ...props }) {
  // Route native date inputs through the in-app calendar so every `<Input type="date">`
  // gets the themed picker (not the grey OS calendar) with no per-page changes.
  if (type === 'date') {
    const { value, onChange, min, max, disabled, placeholder } = props;
    return <DateInput value={value} onChange={onChange} invalid={invalid} min={min} max={max} disabled={disabled} placeholder={placeholder} />;
  }
  return <input className={`input ${invalid ? 'invalid' : ''}`} type={type} {...props} />;
}

// forwardRef so callers (e.g. the formula builder's insert-at-caret) can reach
// the native textarea; existing ref-less usage is unaffected.
export const Textarea = forwardRef(function Textarea({ invalid, ...props }, ref) {
  return <textarea ref={ref} className={`textarea ${invalid ? 'invalid' : ''}`} {...props} />;
});

// Custom date field with an attractive in-app calendar popover (the native OS
// picker can't be styled). Displays DD/MMM/YYYY; emits a native-event-shaped
// { target: { value } } with an ISO yyyy-mm-dd (or '' when cleared), so every
// caller that reads e.target.value keeps working unchanged.
const CAL_WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const toIsoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const CAL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DateInput({ value = '', onChange, invalid, min, max, disabled, placeholder = 'DD/MMM/YYYY' }) {
  const [open, setOpen] = useState(false);
  // 'days' | 'months' | 'years' — the title drills up, picks drill back down.
  const [mode, setMode] = useState('days');
  const anchorRef = useRef(null);
  const yearsRef = useRef(null);

  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [view, setView] = useState(() => selected || new Date());
  const emit = (iso) => onChange && onChange({ target: { value: iso } });

  const minD = min ? new Date(`${min}T00:00:00`) : null;
  const maxD = max ? new Date(`${max}T00:00:00`) : null;
  const todayIso = toIsoDate(new Date());

  const y = view.getFullYear();
  const m = view.getMonth();
  const startPad = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(y, m, d));
  const isDisabledDay = (d) => (minD && d < minD) || (maxD && d > maxD);

  const openCal = () => {
    if (disabled) return;
    if (selected) setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setMode('days');
    setOpen(true);
  };
  const display = value ? fmtDate(value) : '';

  // Header chevrons step by what the grid shows: month, year, or a 12-year jump.
  const navStep = (dir) => {
    if (mode === 'days') setView(new Date(y, m + dir, 1));
    else if (mode === 'months') setView(new Date(y + dir, m, 1));
    else setView(new Date(y + dir * 12, m, 1));
  };
  // Years mode lists every year 1900 → current+10 in one scrollable grid, so a
  // far-back date (e.g. a 1960s DOB) is one scroll away instead of many clicks.
  const YEAR_MIN = 1900;
  const YEAR_MAX = new Date().getFullYear() + 10;
  const allYears = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MAX - i);
  const headTitle = mode === 'days'
    ? view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : mode === 'months' ? String(y)
    : 'Select year';

  // When the year list opens, bring the active year into view.
  useEffect(() => {
    if (open && mode === 'years' && yearsRef.current) {
      const el = yearsRef.current.querySelector('.sel') || yearsRef.current.querySelector('.now');
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }, [open, mode]);

  return (
    <div className="nhr-dateinput" style={{ position: 'relative' }}>
      <button
        ref={anchorRef}
        type="button" disabled={disabled}
        className={`input nhr-combo-trigger flex items-center justify-between gap-2 ${open ? 'is-open' : ''} ${invalid ? 'invalid' : ''}`}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left' }}
        onClick={() => (open ? setOpen(false) : openCal())}
      >
        <span className={display ? '' : 'ink-3'}>{display || placeholder}</span>
        <Calendar size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>
      <PortalMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={268} className="menu-pop nhr-cal">
          <div className="nhr-cal-head">
            <button type="button" className="nhr-cal-nav" onClick={() => navStep(-1)} aria-label="Previous"><ChevronLeft size={16} /></button>
            <button
              type="button"
              className="nhr-cal-title nhr-cal-title-btn"
              title={mode === 'days' ? 'Pick month & year' : mode === 'months' ? 'Pick year' : 'Back to days'}
              onClick={() => setMode(mode === 'days' ? 'months' : mode === 'months' ? 'years' : 'days')}
            >
              {headTitle} <ChevronDown size={13} style={{ opacity: 0.6, transform: mode === 'days' ? 'none' : 'rotate(180deg)' }} />
            </button>
            <button type="button" className="nhr-cal-nav" onClick={() => navStep(1)} aria-label="Next"><ChevronRight size={16} /></button>
          </div>

          {mode === 'days' && (
            <>
              <div className="nhr-cal-grid nhr-cal-dow">
                {CAL_WEEKDAYS.map((w) => <span key={w} className="nhr-cal-dow-cell">{w}</span>)}
              </div>
              <div className="nhr-cal-grid">
                {cells.map((d, i) => {
                  if (!d) return <span key={`p${i}`} />;
                  const iso = toIsoDate(d);
                  return (
                    <button
                      key={iso} type="button" disabled={isDisabledDay(d)}
                      className={`nhr-cal-day ${value === iso ? 'sel' : ''} ${todayIso === iso ? 'today' : ''}`}
                      onClick={() => { emit(iso); setOpen(false); }}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {mode === 'months' && (
            <div className="nhr-cal-block-grid anim-fade-in">
              {CAL_MONTHS.map((mn, mi) => (
                <button
                  key={mn} type="button"
                  className={`nhr-cal-block ${selected && selected.getFullYear() === y && selected.getMonth() === mi ? 'sel' : ''} ${mi === m ? 'now' : ''}`}
                  onClick={() => { setView(new Date(y, mi, 1)); setMode('days'); }}
                >
                  {mn}
                </button>
              ))}
            </div>
          )}

          {mode === 'years' && (
            <div ref={yearsRef} className="nhr-cal-block-grid anim-fade-in" style={{ maxHeight: 214, overflowY: 'auto', paddingRight: 2 }}>
              {allYears.map((yr) => (
                <button
                  key={yr} type="button"
                  className={`nhr-cal-block ${selected && selected.getFullYear() === yr ? 'sel' : ''} ${yr === y ? 'now' : ''}`}
                  onClick={() => { setView(new Date(yr, m, 1)); setMode('months'); }}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}

          <div className="nhr-cal-foot">
            <button type="button" className="nhr-cal-link" onClick={() => { emit(''); setOpen(false); }}>Clear</button>
            <button type="button" className="nhr-cal-link" onClick={() => { const t = new Date(); if (!isDisabledDay(t)) { emit(toIsoDate(t)); setOpen(false); } }}>Today</button>
          </div>
      </PortalMenu>
    </div>
  );
}

// Custom select with a styled dropdown (native <select> popups can't be themed).
// Emits { target: { value } } so callers using e.target.value keep working.
//
// Once the list is long enough to scroll inside the menu, a filter box appears
// at the top — scrolling a long list to find one option is the slow way. The
// threshold is roughly what fits in the 280px menu; pass `searchable` to force
// it on or off for a specific field.
const SELECT_SEARCH_AT = 8;

export function Select({
  options = [], placeholder = 'Select…', invalid, value, onChange, disabled,
  searchable, searchThreshold = SELECT_SEARCH_AT, searchPlaceholder = 'Type to filter…',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const anchorRef = useRef(null);

  const opts = useMemo(
    () => options.map((o) => (o && typeof o === 'object' ? o : { value: o, label: o })),
    [options],
  );
  const showSearch = searchable ?? opts.length > searchThreshold;
  const filtered = useMemo(() => {
    if (!showSearch || !q.trim()) return opts;
    const needle = q.trim().toLowerCase();
    return opts.filter((o) => String(o.label ?? o.value ?? '').toLowerCase().includes(needle));
  }, [opts, q, showSearch]);

  const selected = opts.find((o) => String(o.value) === String(value ?? ''));
  const close = () => { setOpen(false); setQ(''); };
  const pick = (v) => { if (onChange) onChange({ target: { value: v } }); close(); };

  return (
    <div className="nhr-select" style={{ position: 'relative' }}>
      <button
        ref={anchorRef}
        type="button" disabled={disabled}
        className={`input nhr-combo-trigger flex items-center justify-between gap-2 ${open ? 'is-open' : ''} ${invalid ? 'invalid' : ''}`}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left' }}
        onClick={() => !disabled && (open ? close() : setOpen(true))}
      >
        <span className={`truncate ${selected ? '' : 'ink-3'}`}>{selected ? (selected.label ?? selected.value) : placeholder}</span>
        <ChevronDown size={15} className="nhr-caret" />
      </button>
      <PortalMenu open={open} onClose={close} anchorRef={anchorRef} style={{ maxHeight: showSearch ? 320 : 280 }}>
        {showSearch && (
          <div className="searchbox" style={{ padding: '2px 2px 8px' }}>
            <Search size={14} style={{ left: 12 }} />
            <input
              className="input"
              autoFocus
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              // Enter picks the only remaining match — the common case after typing
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length === 1) { e.preventDefault(); pick(filtered[0].value); }
                if (e.key === 'Escape') { e.preventDefault(); close(); }
              }}
              style={{ paddingLeft: 32 }}
            />
          </div>
        )}
        {opts.length === 0 && <div className="t-sm ink-3 text-center" style={{ padding: 10 }}>No options</div>}
        {opts.length > 0 && filtered.length === 0 && (
          <div className="t-sm ink-3 text-center" style={{ padding: 12 }}>No matches</div>
        )}
        {filtered.map((o) => (
          <button
            key={o.value}
            type="button"
            className="menu-item"
            style={String(o.value) === String(value ?? '') ? { background: 'var(--primary-soft)', color: 'var(--primary-700)', fontWeight: 600 } : undefined}
            onClick={() => pick(o.value)}
          >
            {o.label ?? o.value}
          </button>
        ))}
      </PortalMenu>
    </div>
  );
}

// Floating-label text input
export function FloatInput({ label, value, onChange, type = 'text', required, ...props }) {
  return (
    <div className={`float-field ${value ? 'has-value' : ''}`}>
      <input className="input" type={type} value={value} onChange={onChange} {...props} />
      <label>{label}{required && ' *'}</label>
    </div>
  );
}

// Searchable dropdown (combobox)
export function SearchSelect({ options = [], value, onChange, placeholder = 'Search & select…', renderOption }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const anchorRef = useRef(null);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return options.filter((o) => String(o.label ?? o).toLowerCase().includes(needle)).slice(0, 60);
  }, [options, q]);

  const selected = options.find((o) => (o.value ?? o) === value);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={anchorRef}
        type="button"
        className={`input nhr-combo-trigger flex items-center justify-between gap-2 ${open ? 'is-open' : ''}`}
        style={{ cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`truncate ${selected ? '' : 'ink-3'}`}>{selected ? (selected.label ?? selected) : placeholder}</span>
        <ChevronDown size={15} className="nhr-caret" />
      </button>
      <PortalMenu open={open} onClose={() => { setOpen(false); setQ(''); }} anchorRef={anchorRef} style={{ maxHeight: 320 }}>
        <div className="searchbox" style={{ padding: '2px 2px 8px' }}>
          <Search size={14} style={{ left: 12 }} />
          <input className="input" autoFocus placeholder="Type to filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        {filtered.length === 0 && <div className="t-sm ink-3 text-center" style={{ padding: 12 }}>No matches</div>}
        {filtered.map((o) => {
          const v = o.value ?? o;
          return (
            <button
              key={v}
              type="button"
              className="menu-item"
              style={v === value ? { background: 'var(--primary-soft)', color: 'var(--primary-700)', fontWeight: 600 } : undefined}
              onClick={() => { onChange(v, o); setOpen(false); setQ(''); }}
            >
              {renderOption ? renderOption(o) : (o.label ?? o)}
            </button>
          );
        })}
      </PortalMenu>
    </div>
  );
}

// Searchable multi-select (combobox with removable chips). Values are the
// option `value` (or the option itself for plain strings); onChange gets the
// full next array. Options may carry an optional `sub` line shown in the menu.
export function MultiSelect({
  options = [], value = [], onChange,
  placeholder = 'Select…', searchPlaceholder = 'Type to filter…', emptyText = 'No matches',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const anchorRef = useRef(null);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return options
      .filter((o) => `${o.label ?? o} ${o.sub ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 60);
  }, [options, q]);

  const has = (v) => value.includes(v);
  const toggle = (v) => onChange(has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const labelFor = (v) => {
    const o = options.find((x) => (x.value ?? x) === v);
    return o ? (o.label ?? o) : v;
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={anchorRef}
        type="button"
        className={`input nhr-combo-trigger flex items-center justify-between gap-2 ${open ? 'is-open' : ''}`}
        style={{ cursor: 'pointer', textAlign: 'left', height: 'auto', minHeight: 27, padding: '2px 10px', flexWrap: 'wrap' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center flex-wrap gap-1" style={{ minWidth: 0, flex: 1 }}>
          {value.length === 0 && <span className="ink-3">{placeholder}</span>}
          {value.map((v) => (
            <span key={v} className="badge badge-primary" style={{ gap: 6 }}>
              {labelFor(v)}
              <X size={11} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); toggle(v); }} />
            </span>
          ))}
        </span>
        <ChevronDown size={15} className="nhr-caret" />
      </button>
      <PortalMenu open={open} onClose={() => { setOpen(false); setQ(''); }} anchorRef={anchorRef} style={{ maxHeight: 320 }}>
        <div className="searchbox" style={{ padding: '2px 2px 8px' }}>
          <Search size={14} style={{ left: 12 }} />
          <input className="input" autoFocus placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        {filtered.length === 0 && <div className="t-sm ink-3 text-center" style={{ padding: 12 }}>{emptyText}</div>}
        {filtered.map((o) => {
          const v = o.value ?? o;
          const sel = has(v);
          return (
            <button
              key={v}
              type="button"
              className="menu-item flex items-center justify-between gap-2"
              style={sel ? { background: 'var(--primary-soft)', color: 'var(--primary-700)', fontWeight: 600 } : undefined}
              onClick={() => toggle(v)}
            >
              <span style={{ minWidth: 0 }}>
                <span className="truncate" style={{ display: 'block' }}>{o.label ?? o}</span>
                {o.sub && <span className="t-xs ink-3" style={{ display: 'block' }}>{o.sub}</span>}
              </span>
              {sel && <Check size={14} style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </PortalMenu>
    </div>
  );
}

// Tag / chip input
export function TagInput({ value = [], onChange, placeholder = 'Add and press Enter…', suggestions = [] }) {
  const [text, setText] = useState('');
  const add = (t) => {
    const v = t.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  return (
    <div className="input" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 40, height: 'auto', alignItems: 'center' }}>
      {value.map((t) => (
        <span key={t} className="badge badge-primary" style={{ gap: 6 }}>
          {t}
          <X size={11} style={{ cursor: 'pointer' }} onClick={() => onChange(value.filter((x) => x !== t))} />
        </span>
      ))}
      <input
        style={{ border: 'none', outline: 'none', flex: 1, minWidth: 120, fontSize: 13, background: 'transparent' }}
        value={text}
        placeholder={value.length ? '' : placeholder}
        list={suggestions.length ? 'tag-suggestions' : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(text); }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
      />
      {suggestions.length > 0 && (
        <datalist id="tag-suggestions">
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}

export function SwitchField({ checked, onChange, label, desc }) {
  return (
    <label className="flex items-center gap-3" style={{ cursor: 'pointer' }}>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" />
        <span className="thumb" />
      </span>
      <span>
        <span className="t-base fw-6 ink-1">{label}</span>
        {desc && <div className="t-sm ink-3">{desc}</div>}
      </span>
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', style, autoFocus }) {
  return (
    <div className="searchbox" style={style}>
      <Search size={15} />
      <input className="input" value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
