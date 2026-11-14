import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import { hhmm } from '../../lib/format';
import { mergeLive, movement } from '../../lib/live';
import { DEPOT, type LiveRoute, type MonitorRoute } from '../../lib/routes-types';
import { Badge, Empty, Icon, Notice, Segmented } from '../../ui/kit';
import { MapView, type MapLine, type MapMarker } from '../../ui/MapView';

const COLORS = ['#b8482f', '#1f4d3a', '#8e5a32', '#94660a'];
const SIGNAL_LOST_MIN = 3;
/** El mapa se refresca con la versión ligera; el detalle completo (paradas, eventos) se pide con menos frecuencia. */
const LIVE_MS = 5000;
const FULL_MS = 30000;

function ago(now: number, iso: string) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export function Monitoreo() {
  const [data, setData] = useState<{ now: string; routes: MonitorRoute[] } | null>(null);
  const [sel, setSel] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  // el reloj local avanza cada segundo para que "hace 12 s" no se quede congelado entre actualizaciones
  const [tick, setTick] = useState(() => Date.now());
  // diferencia entre el reloj del servidor y el de este equipo: la antigüedad de una ubicación debe medirse con el del servidor
  const skew = useRef(0);

  useEffect(() => {
    const full = () =>
      api<{ now: string; routes: MonitorRoute[] }>('GET', '/routes/monitor')
        .then((d) => {
          skew.current = new Date(d.now).getTime() - Date.now();
          setData(d);
          setLastUpdate(Date.now());
          setError(null);
        })
        .catch((e) => setError(errMsg(e)));
    const live = () =>
      api<{ now: string; routes: LiveRoute[] }>('GET', '/routes/live')
        .then((d) => {
          skew.current = new Date(d.now).getTime() - Date.now();
          setLastUpdate(Date.now());
          setError(null);
          setData((cur) => {
            if (!cur) return cur;
            const m = mergeLive(cur.routes, d.routes);
            if (m.needsFull) void full();
            return { now: d.now, routes: m.routes };
          });
        })
        .catch((e) => setError(errMsg(e)));
    void full();
    // con la pestaña oculta no se consulta: nadie está mirando el mapa
    const tLive = setInterval(() => !document.hidden && void live(), LIVE_MS);
    const tFull = setInterval(() => !document.hidden && void full(), FULL_MS);
    const onShow = () => !document.hidden && void full();
    document.addEventListener('visibilitychange', onShow);
    const tTick = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(tLive);
      clearInterval(tFull);
      clearInterval(tTick);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);

  const routes = useMemo(() => data?.routes ?? [], [data]);
  const visible = routes.filter((r) => sel === 'all' || String(r.id) === sel);
  const now = tick + skew.current;

  const { markers, lines } = useMemo(() => {
    const markers: MapMarker[] = [{ lat: DEPOT[0], lng: DEPOT[1], kind: 'depot' }];
    const lines: MapLine[] = [];
    routes
      .filter((r) => sel === 'all' || String(r.id) === sel)
      .forEach((r) => {
        const color = COLORS[routes.indexOf(r) % COLORS.length];
        const planned: [number, number][] = [DEPOT];
        for (const s of r.stopsMap) {
          const { lat, lng } = s.customer;
          if (lat == null || lng == null) continue;
          planned.push([lat, lng]);
          markers.push({
            lat,
            lng,
            kind: 'stop',
            label: String(s.sequence),
            state: s.status === 'ENTREGADA' ? 'done' : s.status === 'NO_ENTREGADA' ? 'failed' : 'pending',
            tooltip: `${s.sequence}. ${s.customer.name} · ${s.eta ?? 's/h'}`,
          });
        }
        lines.push({ points: planned, color, dashed: true });
        if (r.trail.length > 1) lines.push({ points: r.trail, color });
        if (r.lastPing) {
          const mv = movement(r.speedKmh);
          markers.push({
            id: `truck-${r.id}`,
            lat: r.lastPing.lat,
            lng: r.lastPing.lng,
            kind: 'truck',
            color,
            tooltip: `${r.name} · ${r.driver.name}${mv ? ` · ${mv}` : ''}`,
          });
        }
      });
    return { markers, lines };
  }, [routes, sel]);

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Monitoreo en vivo</h1>
          <div className="small muted">
            Ubicación de los repartidores · se actualiza cada 5 s
            {lastUpdate !== null && <> · última consulta hace {Math.max(0, Math.round((tick - lastUpdate) / 1000))} s</>}
          </div>
        </div>
        {routes.length > 1 && (
          <Segmented
            value={sel}
            onChange={setSel}
            options={[['all', 'Todas'], ...routes.map((r): [string, string] => [String(r.id), r.name.split(' ·')[0]])]}
          />
        )}
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}

      <div className="split">
        <div style={{ flex: 1, minWidth: 0 }}>
          <MapView markers={markers} lines={lines} fitKey={`${sel}:${routes.map((r) => r.id).join()}`} height="calc(100dvh - 190px)" focus={focus} />
        </div>
        <aside className="col gap12" style={{ width: 380, flex: 'none' }}>
          {data && routes.length === 0 && (
            <div className="card">
              <Empty icon="truck" title="No hay rutas en curso">
                Cuando un repartidor cargue su camión y salga a ruta, aparecerá aquí.
              </Empty>
            </div>
          )}
          {visible.map((r) => {
            const color = COLORS[routes.indexOf(r) % COLORS.length];
            const ageMin = r.lastPing ? (now - new Date(r.lastPing.at).getTime()) / 60000 : null;
            const next = r.stopsMap.find((s) => s.status === 'PENDIENTE');
            return (
              <div key={r.id} className="card" data-testid="monitor-route">
                <div className="card-h">
                  <span className="row gap8">
                    <i className="dot" style={{ color }} />
                    <span className="title">{r.name}</span>
                  </span>
                  <span className="row gap12">
                    {r.lastPing && (
                      <button
                        className="link"
                        onClick={() => setFocus({ lat: r.lastPing!.lat, lng: r.lastPing!.lng, n: Date.now() })}
                        aria-label={`Ver a ${r.driver.name} en el mapa`}
                      >
                        Ver en el mapa
                      </button>
                    )}
                    <Link to="/rutas" className="link">
                      Detalle
                    </Link>
                  </span>
                </div>
                <div className="card-b">
                  <div className="row between">
                    <span className="small muted2">
                      {r.driver.name} · {r.vehicle.plate}
                    </span>
                    {ageMin === null ? (
                      <Badge tone="warn">
                        <Icon name="wifioff" size={12} /> Sin ubicación
                      </Badge>
                    ) : ageMin > SIGNAL_LOST_MIN ? (
                      <Badge tone="warn">
                        <Icon name="wifioff" size={12} /> Sin señal {ago(now, r.lastPing!.at)}
                      </Badge>
                    ) : (
                      <Badge tone="ok" dot>
                        {movement(r.speedKmh) ? `${movement(r.speedKmh)} · ` : ''}hace {ago(now, r.lastPing!.at)}
                      </Badge>
                    )}
                  </div>
                  <div className="small strong">
                    {r.stops.delivered + r.stops.failed} de {r.stops.total} entregas{next ? ` · siguiente ETA ${next.eta ?? '—'}` : ''}
                  </div>
                  <div className="pbar">
                    {r.stopsMap.map((s) => (
                      <i key={s.id} className={s.status === 'ENTREGADA' ? 'on' : s.status === 'NO_ENTREGADA' ? 'bad' : s.id === next?.id ? 'cur' : ''} />
                    ))}
                  </div>
                  <hr className="divider" />
                  <span className="overline">Eventos</span>
                  {r.departedAt && (
                    <div className="row gap12">
                      <span className="small strong muted" style={{ width: 42 }}>
                        {hhmm(r.departedAt)}
                      </span>
                      <span className="small">Salida del almacén</span>
                    </div>
                  )}
                  {r.stopsMap
                    .filter((s) => s.arrivedAt || s.deliveredAt)
                    .slice(-4)
                    .map((s) => (
                      <div key={s.id} className="row gap12">
                        <span className="small strong muted" style={{ width: 42 }}>
                          {hhmm(s.deliveredAt ?? s.arrivedAt)}
                        </span>
                        <span className="small">
                          {s.customer.name} · {s.status === 'ENTREGADA' ? 'entregada' : s.status === 'NO_ENTREGADA' ? 'no entregada' : 'llegó'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </aside>
      </div>
    </>
  );
}
