import { useEffect } from 'react';
import { Icon } from './Icon.jsx';

export function Modal({ title, onClose, children, width = 520, className = '', footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${className}`} style={{ width }} role="dialog" aria-label={title}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn dark" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <span className="toggle-text">{checked ? '켜짐' : '꺼짐'}</span>
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

export function Section({ title, children }) {
  return (
    <section className="set-section">
      <h3>{title}</h3>
      <div className="set-rows">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, vip }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}{vip && <span className="vip-badge">★</span>}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

export function Select({ value, onChange, options }) {
  return (
    <select className="select" value={value} onChange={(e) => {
      const opt = options.find((o) => String(o.value) === e.target.value);
      onChange(opt ? opt.value : e.target.value);
    }}>
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

export function ColorInput({ value, onChange }) {
  return (
    <label className="color-input">
      <span className="swatch" style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="color-hex">{value}</span>
    </label>
  );
}

export const range = (from, to, fmt = (n) => String(n)) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ value: from + i, label: fmt(from + i) }));
