import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { pendingCount, useStore } from '../lib/store';

const PATHS: Record<string, string> = {
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a4 4 0 0 0 0-8H8a4 4 0 0 1 0-8h8"/>',
  wallet: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M16 15h2"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  nav: '<path d="m3 11 19-9-9 19-2-8z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  wifioff: '<path d="M2 8.8a15 15 0 0 1 4-2.5M22 8.8a15 15 0 0 0-8.5-3.6M5 12.9a10 10 0 0 1 3.5-2M16.7 11.3A10 10 0 0 1 19 12.9M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/>',
  sync: '<path d="M21 12a9 9 0 0 0-15.5-6.3L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.3L21 16"/><path d="M21 21v-5h-5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  truck: '<path d="M1 6h13v11H1z"/><path d="M14 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="m22 2-11 11"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 21h16"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};

export function Icon({ name, size = 18, color = 'currentColor', sw = 1.75 }: { name: string; size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }} />
  );
}

export function Badge({ tone = 'neutral', children, dot }: { tone?: 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'neutral'; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <i className="dot" />}
      {children}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: string; small?: boolean };
export function Button({ variant = 'primary', icon, small, children, className = '', ...rest }: BtnProps) {
  return (
    <button className={`btn ${variant} ${small ? 'sm' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={18} sw={2} />}
      {children}
    </button>
  );
}

export function Header({ title, sub, back, right }: { title: string; sub?: string; back?: boolean | string; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className={`header ${back ? 'back' : ''}`}>
      {back && (
        <button className="icon-btn" aria-label="Atrás" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}>
          <Icon name="left" size={22} />
        </button>
      )}
      <div className="grow">
        <h1 className={back ? 'h2' : 'h1'}>{title}</h1>
        {sub && <div className={back ? 'caption muted' : 'small muted'}>{sub}</div>}
      </div>
      {right}
    </header>
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

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
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

export function Kv({ k, v, strong, tone }: { k: ReactNode; v: ReactNode; strong?: boolean; tone?: string }) {
  return (
    <div className="kv">
      <span className="small muted2">{k}</span>
      <span className={`small ${strong === false ? '' : 'strong'}`} style={tone ? { color: tone } : undefined}>
        {v}
      </span>
    </div>
  );
}

/** Aviso de conexión: aparece sin señal o cuando hay registros por enviar. */
export function SyncBanner() {
  const s = useStore();
  const n = pendingCount(s);
  if (s.online && n === 0) return null;
  return (
    <Link to="/sync" className="banner">
      <Icon name={s.online ? 'sync' : 'wifioff'} size={16} color="var(--warn)" />
      <span className="grow">
        {s.online ? `Enviando… ${n} registro${n === 1 ? '' : 's'} por sincronizar` : n ? `Sin conexión · ${n} registro${n === 1 ? '' : 's'} por sincronizar` : 'Sin conexión · trabajando con datos guardados'}
      </span>
      <Icon name="right" size={14} color="var(--text-3)" />
    </Link>
  );
}

export function TabBar() {
  const s = useStore();
  const pending = pendingCount(s);
  const tabs: [string, string, string][] = [['/', 'Ruta', 'route'], ['/cobros', 'Cobros', 'wallet'], ['/incidencias', 'Incidencias', 'alert'], ['/perfil', 'Perfil', 'user']];
  return (
    <nav className="tabs">
      {tabs.map(([to, label, icon]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
          <Icon name={icon} size={22} />
          {label}
          {to === '/perfil' && pending > 0 && <span className="pip">{pending}</span>}
        </NavLink>
      ))}
    </nav>
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
