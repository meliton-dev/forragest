import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api, getUser } from '../../lib/api';
import type { PurchaseAlerts } from '../../lib/compras-types';
import { Button, Icon } from '../../ui/kit';

const ROLE: Record<string, string> = { SUPERVISOR_RUTAS: 'Supervisor de rutas', GERENTE_COMPRAS: 'Gerente de compras', ADMINISTRADOR: 'Administrador' };

type NavItem = [to: string, label: string, icon: string, end: boolean, badge?: number];

export function BackShell() {
  const user = getUser()!;
  const seesRoutes = user.role === 'SUPERVISOR_RUTAS' || user.role === 'ADMINISTRADOR';
  const seesPurchasing = user.role === 'GERENTE_COMPRAS' || user.role === 'ADMINISTRADOR';
  // COM-007: el contador del menú avisa de pagos a proveedores vencidos o próximos a vencer
  const [alerts, setAlerts] = useState<PurchaseAlerts | null>(null);
  useEffect(() => {
    if (!seesPurchasing) return;
    const load = () => api<PurchaseAlerts>('GET', '/purchasing/alerts').then(setAlerts).catch(() => undefined);
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [seesPurchasing]);
  const routeItems: NavItem[] = [
    ['/rutas', 'Rutas de reparto', 'route', true],
    ['/rutas/nueva', 'Nueva ruta', 'truck', false],
    ['/rutas/mapa', 'Monitoreo en vivo', 'map', false],
    ['/rutas/eficiencia', 'Eficiencia de entregas', 'chart', false],
  ];
  const purchaseItems: NavItem[] = [
    ['/compras', 'Órdenes de compra', 'receipt', true],
    ['/compras/sugerencias', 'Sugerencias', 'refresh', false, alerts?.toReorder],
    ['/compras/proveedores', 'Proveedores', 'truck', false],
    ['/compras/por-pagar', 'Cuentas por pagar', 'wallet', false, alerts ? alerts.overdue.length + alerts.dueSoon.length : undefined],
    ['/compras/precios', 'Historial y precios', 'chart', false],
  ];
  const groups: [string, NavItem[]][] = [...(seesRoutes ? [['Finanzas y logística', routeItems] as [string, NavItem[]]] : []), ...(seesPurchasing ? [['Compras', purchaseItems] as [string, NavItem[]]] : [])];
  const initials = user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="back">
      <aside className="side">
        <div className="row" style={{ padding: '4px 8px' }}>
          <img src="/icon.svg" alt="" width={28} height={28} style={{ borderRadius: 8 }} />
          <span className="title">Forragest</span>
        </div>
        {groups.map(([title, items]) => (
          <div key={title} style={{ display: 'contents' }}>
            <div className="grp overline">{title}</div>
            {items.map(([to, label, icon, end, badge]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `item ${isActive ? 'on' : ''}`}>
                <Icon name={icon} size={16} />
                <span className="grow">{label}</span>
                {!!badge && <span className="badge warn" aria-label={`${badge} pendientes`}>{badge}</span>}
              </NavLink>
            ))}
          </div>
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
