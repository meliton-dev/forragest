import { Link } from 'react-router-dom';
import { hhmm, longDay, mxn } from '../lib/format';
import { summarize } from '../lib/logic';
import { useStore } from '../lib/store';
import { useTracking } from '../lib/tracking';
import type { Stop } from '../lib/types';
import { Hint } from '../ui/Hint';
import { Badge, Header, Icon, Notice, SyncBanner, TabBar } from '../ui/kit';
import { mapsUrl, RouteGate } from './common';

export function RouteHome() {
  return (
    <RouteGate title="Mi ruta" tabs>
      {(route) => <Inner route={route} />}
    </RouteGate>
  );
}

function Inner({ route }: { route: import('../lib/types').Route }) {
  const s = useStore();
  const gps = useTracking();
  const sum = summarize(route, s.payments);
  const current = route.status === 'EN_CURSO' ? route.stops.find((x) => x.status === 'PENDIENTE') : undefined;
  const allDone = route.status === 'EN_CURSO' && sum.pending === 0;
  const tag =
    route.status === 'EN_CURSO' ? (
      <Badge tone="info" dot>
        En curso
      </Badge>
    ) : route.status === 'FINALIZADA' ? (
      <Badge tone="ok" dot>
        Finalizada
      </Badge>
    ) : (
      <Badge tone="neutral" dot>
        Por iniciar
      </Badge>
    );

  return (
    <div className="screen">
      <Header
        title={route.name}
        sub={`${route.vehicle.plate} · ${longDay(route.date)}${route.departedAt ? ' · Salida ' + hhmm(route.departedAt) : ''}`}
        right={tag}
      />
      <div className="content">
        <div className="col gap8">
          <div className="row between">
            <span className="small strong">
              {sum.delivered + sum.failed} de {sum.total} paradas atendidas
            </span>
            <span className="small muted">Por cobrar {mxn(sum.pendingToCollect)}</span>
          </div>
          <div className="progress">
            {route.stops.map((x, i) => (
              <i
                key={x.id}
                className={
                  x.status === 'ENTREGADA'
                    ? 'on'
                    : x.status === 'NO_ENTREGADA'
                      ? 'bad'
                      : x.id === current?.id || (i === 0 && route.status === 'PROGRAMADA')
                        ? 'cur'
                        : ''
                }
              />
            ))}
          </div>
        </div>

        <SyncBanner />
        {route.status === 'EN_CURSO' && (
          <Hint id="ruta">
            Toca la <b>parada destacada</b> para ver qué entregar y cuánto cobrar. Tu avance se guarda aunque no tengas señal.
          </Hint>
        )}
        {route.status === 'EN_CURSO' && ['denied', 'unsupported', 'error'].includes(gps.status) && (
          <Notice tone="warn" icon="pin">
            {gps.status === 'denied'
              ? 'La ubicación está desactivada: tu supervisor no podrá seguir la ruta. Actívala en los permisos del navegador (requiere conexión segura HTTPS).'
              : gps.status === 'unsupported'
                ? 'Este dispositivo no permite compartir la ubicación.'
                : 'No se pudo obtener tu ubicación. Revisa que el GPS esté encendido.'}
          </Notice>
        )}

        {route.status === 'PROGRAMADA' && (
          <Link to="/carga" className="card accent">
            <div className="row">
              <Icon name="truck" size={20} color="var(--accent)" />
              <div className="grow">
                <div className="title">Carga tu camión para salir</div>
                <div className="caption muted">Verifica los productos y registra la salida del almacén.</div>
              </div>
              <Icon name="right" size={16} color="var(--text-3)" />
            </div>
          </Link>
        )}

        {allDone && (
          <Link to="/cierre" className="card accent">
            <div className="row">
              <Icon name="check" size={20} color="var(--accent)" />
              <div className="grow">
                <div className="title">Ruta completa</div>
                <div className="caption muted">Cierra la ruta y registra tu regreso al almacén.</div>
              </div>
              <Icon name="right" size={16} color="var(--text-3)" />
            </div>
          </Link>
        )}
        {route.status === 'FINALIZADA' && (
          <Link to="/cierre" className="card">
            <div className="row">
              <Icon name="check" size={20} color="var(--ok)" />
              <div className="grow">
                <div className="title">Ruta cerrada a las {hhmm(route.returnedAt)}</div>
                <div className="caption muted">Ver resumen</div>
              </div>
              <Icon name="right" size={16} color="var(--text-3)" />
            </div>
          </Link>
        )}

        <div className="timeline">
          {route.stops.map((st, i) => (
            <StopRow key={st.id} stop={st} current={st.id === current?.id} last={i === route.stops.length - 1} started={route.status !== 'PROGRAMADA'} />
          ))}
        </div>
      </div>
      <TabBar />
    </div>
  );
}

function StopRow({ stop, current, last, started }: { stop: Stop; current: boolean; last: boolean; started: boolean }) {
  const done = stop.status === 'ENTREGADA';
  const bad = stop.status === 'NO_ENTREGADA';
  return (
    <div className="tl-row">
      <div className="tl-side">
        <div className={`tl-node ${done ? 'done' : bad ? 'bad' : current ? 'cur' : ''}`}>
          {done ? <Icon name="check" size={13} color="#fff" sw={3} /> : bad ? <Icon name="x" size={13} sw={3} /> : current ? null : stop.sequence}
        </div>
        {!last && <div className={`tl-line ${done ? 'done' : ''}`} />}
      </div>
      <div className="tl-body">
        {current ? (
          <div className="card accent" style={{ gap: 12 }}>
            <div className="row between">
              <span className="overline" style={{ color: 'var(--accent)' }}>
                Siguiente parada
              </span>
              <span className="caption muted2 row gap4">
                <Icon name="clock" size={13} color="var(--text-3)" /> ETA {stop.eta}
              </span>
            </div>
            <Link to={`/parada/${stop.id}`} className="col gap4">
              <div className="h2">{stop.customer.name}</div>
              <div className="row small muted2">
                <Icon name="pin" size={14} color="var(--text-3)" />
                {stop.customer.address}
              </div>
            </Link>
            <div className="tile col gap4">
              {stop.items.map((it) => (
                <div key={it.id} className="small">
                  {it.quantity} × {it.name} {it.presentation.replace('Saco ', '')}
                </div>
              ))}
              <div className="kv">
                <span className="caption muted">{stop.paymentTerms === 'Contado' ? 'Por cobrar (contado)' : stop.paymentTerms}</span>
                <span className="title" style={{ color: 'var(--accent-dark)' }}>
                  {mxn(stop.total)}
                </span>
              </div>
            </div>
            <div className="btn-row">
              <a className="btn secondary sm" href={mapsUrl(stop.customer.address)} target="_blank" rel="noreferrer">
                <Icon name="nav" size={16} /> Navegar
              </a>
              <Link className="btn primary sm" to={`/parada/${stop.id}`}>
                <Icon name="box" size={16} sw={2} /> Entregar
              </Link>
            </div>
          </div>
        ) : (
          <Link to={`/parada/${stop.id}`} className="card tight">
            <div className="row">
              <div className="grow">
                <div className="small strong">{stop.customer.name}</div>
                <div className="caption muted">
                  {done
                    ? `Entregada ${hhmm(stop.deliveredAt)}`
                    : bad
                      ? 'No entregada'
                      : started
                        ? `Programada ${stop.eta}`
                        : `${stop.eta} · ${stop.items.reduce((a, x) => a + x.quantity, 0)} sacos`}
                </div>
              </div>
              {bad && <Badge tone="danger">No entregada</Badge>}
              <Icon name="right" size={14} color="var(--text-3)" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
