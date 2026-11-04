import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const PATHS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  transfer: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>', card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-15.5-6.3L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.3L21 16"/><path d="M21 21v-5h-5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  wallet: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M16 15h2"/>',
};

export function Icon({ name, size = 18, color = 'currentColor', sw = 1.75 }: { name: string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }} />;
}

export function Badge({ tone = 'neutral', children, dot }: { tone?: 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'neutral'; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <i className="dot" />}
      {children}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: string; size?: 'sm' | 'lg' };
export function Button({ variant = 'secondary', icon, size, children, className = '', ...rest }: BtnProps) {
  return (
    <button className={`btn ${variant} ${size ?? ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} sw={2} />}
      {children}
    </button>
  );
}

export function Field({ label, link, children }: { label: string; link?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        {link}
      </label>
      {children}
    </div>
  );
}

export function Input({ icon, prefix, suffix, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: string; prefix?: string; suffix?: ReactNode }) {
  return (
    <div className="input">
      {icon && <Icon name={icon} size={16} color="var(--text-3)" />}
      {prefix && <span className="affix">{prefix}</span>}
      <input {...rest} />
      {suffix}
    </div>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="input area">
      <textarea {...props} />
    </div>
  );
}

export function Select({ value, onChange, children }: { value: string | number; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="input">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <Icon name="down" size={15} color="var(--text-3)" />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, soft }: { value: T; options: [T, string][]; onChange: (v: T) => void; soft?: boolean }) {
  return (
    <div className={`seg ${soft ? 'soft' : ''}`}>
      {options.map(([v, l]) => (
        <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = 'info', icon = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'neutral' | 'ok'; icon?: string; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`}>
      <Icon name={icon} size={15} />
      <div className="grow">{children}</div>
    </div>
  );
}

export function Kv({ k, v, strong, tone, big }: { k: ReactNode; v: ReactNode; strong?: boolean; tone?: string; big?: boolean }) {
  return (
    <div className="kv">
      <span className={`${big ? 'title' : 'small'} ${big ? '' : 'muted2'}`}>{k}</span>
      <span className={big ? 'num' : `small ${strong === false ? '' : 'strong'}`} style={tone ? { color: tone } : undefined}>
        {v}
      </span>
    </div>
  );
}

export function Modal({ title, sub, onClose, children, footer, wide }: { title: string; sub?: string; onClose?: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" role="dialog" aria-modal aria-label={title}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-h">
          <div>
            <h2 className="h2">{title}</h2>
            {sub && <div className="small muted">{sub}</div>}
          </div>
          {onClose && (
            <button className="icon-btn" aria-label="Cerrar" onClick={onClose}>
              <Icon name="x" size={18} color="var(--text-2)" />
            </button>
          )}
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} color="var(--border-strong)" />
      <div className="title muted2">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}
