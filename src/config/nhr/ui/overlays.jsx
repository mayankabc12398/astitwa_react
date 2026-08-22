// Modal, Drawer, ConfirmDialog — portal-based overlays with animations.
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { useEscape, useBodyLock } from '../hooks.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({ open, onClose, title, subtitle, size = '', footer, children, headerExtra, bodyClass = '' }) {
  useEscape(onClose, open);
  useBodyLock(open);
  const panel = useRef(null);

  // The panel takes focus when it opens, so a screen reader lands inside the
  // drawer rather than back at the top of the page behind it. preventScroll
  // because the page under an open drawer must not move.
  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);

  /* Tab cycles inside the panel instead of walking off into the page behind it.
     Handled on the panel rather than on document, so a drawer opened FROM a
     drawer traps on its own — whichever one holds focus is the one that acts. */
  const onKeyDown = useCallback((e) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) { e.preventDefault(); panel.current.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const on = document.activeElement;
    if (e.shiftKey && (on === first || on === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && on === last) { e.preventDefault(); first.focus(); }
  }, []);

  if (!open) return null;
  // No title/subtitle/headerExtra -> skip the head bar entirely and float the
  // close button over the content (these drawers carry their own hero header).
  const headless = !title && !subtitle && !headerExtra;
  return createPortal(
    <div className="nhr-scope nhr-portal-layer">
      <div className="overlay" onClick={onClose} />
      <aside
        ref={panel}
        className={`drawer ${size ? `drawer-${size}` : ''}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {headless ? (
          <button className="icon-btn drawer-close-float" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        ) : (
          <div className="drawer-head">
            <div className="flex-1" style={{ minWidth: 0 }}>
              <div className="t-lg fw-7 truncate">{title}</div>
              {subtitle && <div className="t-sm ink-3 mt-1">{subtitle}</div>}
            </div>
            {headerExtra}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={17} />
            </button>
          </div>
        )}
        <div className={`drawer-body${bodyClass ? ` ${bodyClass}` : ''}`}>{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}

export function Modal({ open, onClose, title, subtitle, size = '', footer, children }) {
  useEscape(onClose, open);
  useBodyLock(open);
  if (!open) return null;
  return createPortal(
    <div className="nhr-scope nhr-portal-layer">
      <div className="modal-wrap">
      <div className="overlay" onClick={onClose} />
      <div className={`modal ${size ? `modal-${size}` : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="flex-1" style={{ minWidth: 0 }}>
            <div className="t-lg fw-7">{title}</div>
            {subtitle && <div className="t-sm ink-3 mt-1">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', desc, confirmText = 'Confirm', danger = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span
            style={{
              width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: danger ? 'var(--danger-soft)' : 'var(--warning-soft)',
              color: danger ? 'var(--danger-ink)' : 'var(--warning-ink)',
            }}
          >
            <AlertTriangle size={17} />
          </span>
          {title}
        </span>
      }
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onConfirm?.(); onClose(); }}>
            {confirmText}
          </button>
        </>
      }
    >
      <p className="t-base ink-2" style={{ lineHeight: 1.6 }}>{desc}</p>
    </Modal>
  );
}
