import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser } from '../lib/api';
import { usePref, writePref } from '../lib/prefs';
import { logout, pendingCount, useStore } from '../lib/store';
import { useTracking } from '../lib/tracking';
import { Button, Header, Icon, Notice, TabBar } from '../ui/kit';

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function Perfil() {
  const s = useStore();
  const gps = useTracking();
  const gpsPref = usePref('gps');
  const user = getUser();
  const [prompt, setPrompt] = useState<any>(null);
  const pending = pendingCount(s);
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
              color: 'var(--accent-dark)',
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
            icon="wifioff"
            label="Modo sin conexión"
            right={
              <span className="switch on">
                <i />
              </span>
            }
          />
          <Row
            icon="pin"
            label="Compartir ubicación"
            value={
              gpsPref === '0'
                ? 'Desactivada'
                : {
                    idle: 'Solo en ruta',
                    active: gps.pending ? `Activa · ${gps.pending} por enviar` : 'Activa',
                    denied: 'Sin permiso',
                    unsupported: 'No disponible',
                    error: 'Sin señal GPS',
                  }[gps.status]
            }
            right={
              <button
                role="switch"
                aria-checked={gpsPref !== '0'}
                aria-label="Compartir ubicación durante la ruta"
                className={'switch' + (gpsPref !== '0' ? ' on' : '')}
                onClick={() => writePref('gps', gpsPref === '0' ? '1' : '0')}
              >
                <i />
              </button>
            }
          />
          <Row icon="sync" label="Sincronización" to="/sync" value={pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : 'Al día'} />
          <Row icon="map" label="Navegación" value="Google Maps" />
          <Row icon="info" label="Ayuda y tutorial" to="/ayuda" />
          <Row icon="info" label="Versión de la app" value="1.0" last />
        </div>

        <button className="btn secondary" onClick={() => void logout()}>
          <Icon name="logout" size={17} color="var(--danger)" />
          <span style={{ color: 'var(--danger)' }}>Cerrar sesión</span>
        </button>
        {pending > 0 && (
          <Notice tone="warn" icon="alert">
            Tienes {pending} registro{pending === 1 ? '' : 's'} sin enviar. Al cerrar sesión se perderían.
          </Notice>
        )}
      </div>
      <TabBar />
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
