import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import { hhmm } from '../../lib/format';
import { DEPOT, type MonitorRoute } from '../../lib/routes-types';
import { Badge, Empty, Icon, Notice, Segmented } from '../../ui/kit';
import { MapView, type MapLine, type MapMarker } from '../../ui/MapView';

const COLORS = ['#0b5fe0', '#1f5fa8', '#8e5a32', '#6e5aa8'];
const SIGNAL_LOST_MIN = 3;

function ago(now: number, iso: string) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export function Monitoreo() {
  const [data, setData] = useState<{ now: string; routes: MonitorRoute[] } | null>(null);
  const [sel, setSel] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      api<{ now: string; routes: MonitorRoute[] }>('GET', '/routes/monitor')
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(errMsg(e)));
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const routes = useMemo(() => data?.routes ?? [], [data]);
  const visible = routes.filter((r) => sel === 'all' || String(r.id) === sel);
  const now = data ? new Date(data.now).getTime() : Date.now();

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
        if (r.lastPing) markers.push({ lat: r.lastPing.lat, lng: r.lastPing.lng, kind: 'truck', color, tooltip: `${r.name} · ${r.driver.name}` });
      });
    return { markers, lines };
  }, [routes, sel]);

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Monitoreo en vivo</h1>
          <div className="small muted">Ubicación de los repartidores · se actualiza cada 10 s</div>
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
          <MapView markers={markers} lines={lines} fitKey={`${sel}:${routes.map((r) => r.id).join()}`} height="calc(100dvh - 190px)" />
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
                  <Link to="/rutas" className="link">
                    Detalle
                  </Link>
                </div>
                <div className="card-b">
                  <div className="row between">
                    <span className="small muted2">
                      {r.driver.name} · {r.vehicle.plate}
                    </span>
                    {ageMin === null ? (
                      <Badge>Sin ubicación</Badge>
                    ) : ageMin > SIGNAL_LOST_MIN ? (
                      <Badge tone="warn">
                        <Icon name="wifioff" size={12} /> Sin señal {ago(now, r.lastPing!.at)}
                      </Badge>
                    ) : (
                      <Badge tone="ok" dot>
                        Ubicación hace {ago(now, r.lastPing!.at)}
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
