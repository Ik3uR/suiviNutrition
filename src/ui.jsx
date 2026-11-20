import { useEffect, useState } from 'preact/hooks';
import { fmtNum, r0 } from './util.js';

// ---------- Feuille du bas (bottom sheet) ----------
export function Sheet({ open, onClose, title, children, full }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div class="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={'sheet' + (full ? ' sheet-full' : '')} role="dialog" aria-label={title}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- Message temporaire avec « Annuler » ----------
let pushToast = () => {};
export function toast(text, action) {
  pushToast({ text, action, id: Math.random() });
}
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => {
    pushToast = setT;
  }, []);
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => setT(null), t.action ? 5000 : 2500);
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <div class="toast" role="status">
      <span>{t.text}</span>
      {t.action && (
        <button
          onClick={() => {
            t.action.run();
            setT(null);
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

// ---------- Barre de progression vers une cible ----------
export function Bar({ label, value, target, unit = 'g' }) {
  const pct = Math.min(100, (value / target) * 100);
  const over = value > target * 1.1;
  return (
    <div class="bar">
      <div class="bar-top">
        <span class="bar-label">{label}</span>
        <span class="bar-val">
          <b>{fmtNum(r0(value))}</b> / {fmtNum(target)} {unit}
        </span>
      </div>
      <div class="bar-track">
        <div class={'bar-fill' + (over ? ' over' : '')} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange, small }) {
  return (
    <div class={'seg' + (small ? ' seg-small' : '')} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          class={value === o.id ? 'on' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Champ nombre adapté au clavier numérique de l'iPhone. */
export function NumInput({ value, onInput, placeholder, step, suffix, autoFocus, ...rest }) {
  return (
    <label class="num-input">
      <input
        type="text"
        inputMode={step && step < 1 ? 'decimal' : 'decimal'}
        value={value ?? ''}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onInput={(e) => onInput(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        {...rest}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  barcode: 'M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12',
  paste: 'M9 4h6v3H9zM7 5H5v15h14V5h-2M8 11h8M8 15h5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4L10.6 6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z',
  meal: 'M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6M17 3c-2 0-3 3-3 6s1 4 3 4v8',
  run: 'M13 4a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M9 20l3-6 3 2v5M6 12l3-4 4 1 3 4h3M12 14l-2-5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  check: 'M5 12l5 5 9-10',
};

export function Icon({ name, size = 22, fill }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Empty({ children }) {
  return <p class="empty">{children}</p>;
}
