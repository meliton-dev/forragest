import type { ReactNode } from 'react';
import { Icon } from './kit';

const AREAS: [icon: string, title: string, text: string][] = [
  ['receipt', 'Punto de venta', 'Cobro, tickets y corte de caja'],
  ['route', 'Logística', 'Rutas de reparto y monitoreo en vivo'],
  ['wallet', 'Compras y finanzas', 'Órdenes, proveedores y cuentas por pagar'],
];

/** Marco de las pantallas de acceso: presentación del sistema a la izquierda y el formulario a la derecha. */
export function AuthLayout({ title, text, leaving, children }: { title: string; text: string; leaving?: boolean; children: ReactNode }) {
  return (
    <div className={`login auth ${leaving ? 'leaving' : ''}`}>
      <section className="login-brand">
        <div className="auth-logo">
          <img src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <strong>Forragest</strong>
            <small>Plataforma de gestión</small>
          </div>
        </div>
        <div className="auth-pitch">
          <h2>{title}</h2>
          <p>{text}</p>
          <ul>
            {AREAS.map(([icon, name, detail]) => (
              <li key={name}>
                <span className="auth-ico">
                  <Icon name={icon} size={18} />
                </span>
                <span>
                  <b>{name}</b>
                  <small>{detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="auth-foot">Forrajera San Miguel · Acceso exclusivo para personal autorizado</div>
      </section>
      <main className="login-form">{children}</main>
    </div>
  );
}
