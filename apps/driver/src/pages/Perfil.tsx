import { AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser } from '../lib/api';
import { logout, useStore } from '../lib/store';
import { useTracking } from '../lib/tracking';
import { Button, Header, Icon, Notice, TabBar } from '../ui/kit';
import { ConfirmLogout } from '../ui/Overlays';

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function Perfil() {
  const s = useStore();
  const gps = useTracking();
  const user = getUser();
  const [prompt, setPrompt] = useState<any>(null);
  const [leaving, setLeaving] = useState(false);
  const initials = (user?.fullName ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  return (
    <div className="screen">
      <Header title="Perfil" />
      <div className="content">
        <div className="card row-card" style={{ padding: 16, gap: 14 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--accent-soft)',
              color: 'var(--ink)',
              display: 'grid',
              placeItems: 'center',
            }}
            className="h2"
          >
            {initials}
          </div>
          <div className="grow">
            <div className="h2">{user?.fullName}</div>
            <div className="small muted">Chofer{s.route ? ` · Camión ${s.route.vehicle.plate}` : ''}</div>
          </div>
        </div>

        {!standalone && prompt && (
          <Button
            icon="download"
            onClick={async () => {
              prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }}
          >
            Instalar la aplicación
          </Button>
        )}
        {!standalone && isIos && (
          <Notice tone="info" icon="download">
            Para instalarla en tu iPhone: toca <b>Compartir</b> en Safari y elige <b>“Agregar a pantalla de inicio”</b>.
          </Notice>
        )}

        <div className="card" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          <Row
            icon="pin"
            label="Ubicación"
            value={
              {
                idle: 'Se comparte durante la ruta',
                active: 'Compartiendo',
                denied: 'Sin permiso',
                unsupported: 'No disponible',
                error: 'Sin señal GPS',
              }[gps.status]
            }
          />
          <Row icon="map" label="Navegación" value="Google Maps" />
          <Row icon="lock" label="Cambiar contraseña" to="/perfil/contrasena" />
          <Row icon="info" label="Ayuda y tutorial" to="/ayuda" />
          <Row icon="info" label="Versión de la app" value="1.0" last />
        </div>

        <button className="btn secondary" onClick={() => setLeaving(true)}>
          <Icon name="logout" size={17} color="var(--danger)" />
          <span style={{ color: 'var(--danger)' }}>Cerrar sesión</span>
        </button>
      </div>
      <TabBar />
      <AnimatePresence>
        {leaving && <ConfirmLogout sharing={s.route?.status === 'EN_CURSO'} onConfirm={logout} onCancel={() => setLeaving(false)} />}
      </AnimatePresence>
    </div>
  );
}

function Row({ icon, label, value, right, to, last }: { icon: string; label: string; value?: string; right?: React.ReactNode; to?: string; last?: boolean }) {
  const body = (
    <div className="row" style={{ padding: '0 14px', height: 52, borderBottom: last ? 0 : '1px solid var(--border)' }}>
      <Icon name={icon} size={18} color="var(--text-2)" />
      <span className="grow">{label}</span>
      {right}
      {value && <span className="small muted">{value}</span>}
      {to && <Icon name="right" size={14} color="var(--text-3)" />}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
