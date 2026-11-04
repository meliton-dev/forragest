import { Link, NavLink, Outlet } from 'react-router-dom';
import { getUser } from '../../lib/api';
import { Button, Icon } from '../../ui/kit';

const ROLE: Record<string, string> = { SUPERVISOR_RUTAS: 'Supervisor de rutas', ADMINISTRADOR: 'Administrador' };

export function BackShell() {
  const user = getUser()!;
  const items: [string, string, string, boolean][] = [
    ['/rutas', 'Rutas de reparto', 'route', true],
    ['/rutas/nueva', 'Nueva ruta', 'truck', false],
    ['/rutas/mapa', 'Monitoreo en vivo', 'map', false],
    ['/rutas/eficiencia', 'Eficiencia de entregas', 'chart', false],
  ];
  const initials = user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="back">
      <aside className="side">
        <div className="row" style={{ padding: '4px 8px' }}>
          <img src="/icon.svg" alt="" width={28} height={28} style={{ borderRadius: 8 }} />
          <span className="title">Forragest</span>
        </div>
        <div className="grp overline">Finanzas y logística</div>
        {items.map(([to, label, icon, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `item ${isActive ? 'on' : ''}`}>
            <Icon name={icon} size={16} />
            {label}
          </NavLink>
        ))}
        {user.role === 'ADMINISTRADOR' && (
          <>
            <div className="grp overline">Operación</div>
            <Link to="/" className="item" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 8px', fontSize: 13, color: 'var(--text-2)' }}>
              <Icon name="receipt" size={16} />
              Punto de venta
            </Link>
          </>
        )}
        <div className="user">
          <div className="avatar">{initials}</div>
          <div className="grow">
            <div className="small strong">{user.fullName}</div>
            <div className="caption muted">{ROLE[user.role] ?? user.role}</div>
          </div>
          <Button size="sm" icon="logout" aria-label="Salir" onClick={() => window.dispatchEvent(new Event('fw:unauthorized'))} />
        </div>
      </aside>
      <main className="back-main">
        <Outlet />
      </main>
    </div>
  );
}
