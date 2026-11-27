import { m, type HTMLMotionProps } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Info,
  Loader2,
  Lock,
  LogOut,
  Map as MapIcon,
  MapPin,
  Navigation,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Search,
  Send,
  Truck,
  User,
  Wallet,
  WifiOff,
  X,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

/** Una sola biblioteca de iconos (Lucide) para toda la app: mismo trazo, mismas proporciones. */
const ICONS: Record<string, LucideIcon> = {
  route: Route,
  wallet: Wallet,
  alert: AlertTriangle,
  user: User,
  check: Check,
  box: Package,
  clock: Clock,
  pin: MapPin,
  nav: Navigation,
  phone: Phone,
  camera: Camera,
  left: ChevronLeft,
  right: ChevronRight,
  down: ChevronDown,
  wifioff: WifiOff,
  sync: RefreshCw,
  logout: LogOut,
  search: Search,
  bell: Bell,
  lock: Lock,
  leaf: Wheat,
  plus: Plus,
  map: MapIcon,
  truck: Truck,
  info: Info,
  x: X,
  send: Send,
  download: Download,
  eye: Eye,
  cube: Box,
};

export function Icon({ name, size = 18, color = 'currentColor', sw = 2, spin }: { name: string; size?: number; color?: string; sw?: number; spin?: boolean }) {
  const C = ICONS[name];
  return C ? <C size={size} color={color} strokeWidth={sw} aria-hidden className={spin ? 'spin' : undefined} /> : null;
}

export function Badge({
  tone = 'neutral',
  children,
  dot,
}: {
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'neutral';
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <i className="dot" />}
      {children}
    </span>
  );
}

type BtnProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
  small?: boolean;
  loading?: boolean;
  children?: ReactNode;
};
/** Botón con respuesta al toque (se hunde ligeramente) y estado de carga. */
export function Button({ variant = 'primary', icon, small, loading, children, className = '', disabled, ...rest }: BtnProps) {
  return (
    <m.button
      className={`btn ${variant} ${small ? 'sm' : ''} ${className}`}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={18} strokeWidth={2.25} className="spin" aria-hidden /> : icon && <Icon name={icon} size={18} sw={2.25} />}
      {children}
    </m.button>
  );
}

export function Header({ title, sub, back, right }: { title: string; sub?: string; back?: boolean | string; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className={`header ${back ? 'back' : ''}`}>
      {back && (
        <m.button className="icon-btn" aria-label="Atrás" whileTap={{ scale: 0.9 }} onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}>
          <Icon name="left" size={24} />
        </m.button>
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
      {icon && <Icon name={icon} size={18} color="var(--text-3)" />}
      {prefix && <span className="affix">{prefix}</span>}
      <input {...rest} />
      {suffix}
    </div>
  );
}

/** Ojito para ver u ocultar una contraseña: abierto cuando se ve el texto, cerrado cuando está oculto. */
export function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const label = shown ? 'Ocultar contraseña' : 'Mostrar contraseña';
  return (
    <button type="button" className={`eye ${shown ? 'open' : ''}`} aria-label={label} aria-pressed={shown} onClick={onToggle}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <g className="eye-open">
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.8" />
        </g>
        <g className="eye-closed">
          <path d="M2 10s3.6 5.5 10 5.5S22 10 22 10" />
          <path d="M12 15.5V19M6.5 14l-2 3M17.5 14l2 3" />
        </g>
      </svg>
    </button>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="input area">
      <textarea {...props} />
    </div>
  );
}

/** Selector con una pastilla que se desliza hacia la opción elegida. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {value === v && <m.span layoutId={`seg-${id}`} className="seg-thumb" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
          {l}
        </button>
      ))}
    </div>
  );
}

export function Notice({
  tone = 'info',
  icon = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'neutral' | 'ok';
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`}>
      <Icon name={icon} size={16} />
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

export function TabBar() {
  const tabs: [string, string, string][] = [
    ['/', 'Ruta', 'route'],
    ['/cobros', 'Cobros', 'wallet'],
    ['/incidencias', 'Incidencias', 'alert'],
    ['/perfil', 'Perfil', 'user'],
  ];
  return (
    <nav className="tabs" aria-label="Navegación principal">
      {tabs.map(([to, label, icon]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
          {({ isActive }) => (
            <>
              {isActive && <m.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 460, damping: 34 }} />}
              <m.span
                animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                style={{ display: 'grid' }}
              >
                <Icon name={icon} size={22} />
              </m.span>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <m.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
        <Icon name={icon} size={36} color="var(--border-strong)" />
      </m.div>
      <div className="title muted2">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}
