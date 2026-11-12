import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import { hhmm, mxn } from '../../lib/format';
import { FAIL_LABEL, ROUTE_STATUS_LABEL, type RouteDetail, type RouteKpis, type RouteRow } from '../../lib/routes-types';
import { Badge, Empty, Icon, Notice, Segmented } from '../../ui/kit';

type Scope = 'today' | 'scheduled' | 'finished';
const TONE = { PROGRAMADA: 'neutral', EN_CURSO: 'info', FINALIZADA: 'ok' } as const;

export function RutasLista() {
  const [scope, setScope] = useState<Scope>('today');
  const [data, setData] = useState<{ routes: RouteRow[]; kpis: RouteKpis } | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ routes: RouteRow[]; kpis: RouteKpis }>('GET', `/routes?scope=${scope}`);
      setData(r);
      setError(null);
      setSelId((cur) => (cur && r.routes.some((x) => x.id === cur) ? cur : (r.routes[0]?.id ?? null)));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [scope]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (selId === null) return setDetail(null);
    api<RouteDetail>('GET', `/routes/${selId}`)
      .then(setDetail)
      .catch((e) => setError(errMsg(e)));
  }, [selId, data]);

  const k = data?.kpis;
  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Rutas de reparto</h1>
          <div className="small muted">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="row gap8">
          <Link to="/rutas/mapa" className="btn secondary">
            <Icon name="pin" size={16} /> Mapa en vivo
          </Link>
          <Link to="/rutas/nueva" className="btn primary">
            <Icon name="plus" size={16} sw={2} /> Nueva ruta
          </Link>
        </div>
      </div>

      {k && (
        <div className="kpis">
          <div className="card kpi">
            <span className="overline">Rutas de hoy</span>
            <span className="num-lg" data-testid="kpi-routes">
              {k.routesToday}
            </span>
            <span className="caption muted">
              {k.inProgress} en curso · {k.scheduled} programadas · {k.finished} finalizadas
            </span>
          </div>
          <div className="card kpi">
            <span className="overline">Entregas hechas</span>
            <span className="num-lg">
              {k.stopsDelivered} de {k.stopsTotal}
            </span>
            <span className="caption muted">{k.stopsTotal ? Math.round((k.stopsDelivered / k.stopsTotal) * 100) : 0} % del plan</span>
          </div>
          <div className="card kpi">
            <span className="overline">Entregas a tiempo</span>
            <span className="num-lg" style={{ color: k.onTimePct === null ? undefined : k.onTimePct >= 85 ? 'var(--ok)' : 'var(--warn)' }}>
              {k.onTimePct === null ? '—' : `${k.onTimePct} %`}
            </span>
            <span className="caption muted">Meta ≥ 85 %</span>
          </div>
          <div className="card kpi">
            <span className="overline">Por cobrar en ruta</span>
            <span className="num-lg">{mxn(k.pendingToCollect)}</span>
            <span className="caption muted">{mxn(k.collected)} ya cobrado</span>
          </div>
        </div>
      )}
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}

      <div className="split">
        <div className="grow" style={{ flex: 1 }}>
          <div style={{ alignSelf: 'flex-start' }}>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                ['today', 'Hoy'],
                ['scheduled', 'Programadas'],
                ['finished', 'Finalizadas'],
              ]}
            />
          </div>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Ruta</th>
                  <th style={{ width: 140 }}>Chofer y camión</th>
                  <th style={{ width: 70 }}>Salida</th>
                  <th style={{ width: 150 }}>Avance</th>
                  <th className="right" style={{ width: 110 }}>
                    Por cobrar
                  </th>
                  <th style={{ width: 110 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {(data?.routes ?? []).map((r) => (
                  <tr key={r.id} className={`click ${selId === r.id ? 'sel' : ''}`} onClick={() => setSelId(r.id)}>
                    <td className="strong">
                      {r.name}
                      <div className="caption muted">{r.date}</div>
                    </td>
                    <td>
                      {r.driver.name}
                      <div className="caption muted">{r.vehicle.plate}</div>
                    </td>
                    <td className="muted">{r.departedAt ? hhmm(r.departedAt) : (r.plannedDeparture ?? '—')}</td>
                    <td>
                      <div className="small">
                        {r.stops.delivered + r.stops.failed} de {r.stops.total} paradas
                      </div>
                      <div className="pbar" style={{ marginTop: 4 }}>
                        {Array.from({ length: r.stops.total }, (_, i) => (
                          <i key={i} className={i < r.stops.delivered ? 'on' : i < r.stops.delivered + r.stops.failed ? 'bad' : ''} />
                        ))}
                      </div>
                    </td>
                    <td className="right strong">{mxn(r.pendingToCollect)}</td>
                    <td>
                      <Badge tone={TONE[r.status]} dot>
                        {ROUTE_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.routes.length === 0 && (
              <Empty icon="route" title="Sin rutas">
                No hay rutas en esta vista.
              </Empty>
            )}
          </div>
        </div>

        <aside className="card" style={{ width: 380, flex: 'none' }}>
          {!detail ? (
            <Empty icon="route" title="Selecciona una ruta" />
          ) : (
            <>
              <div className="card-h">
                <span className="title">{detail.name}</span>
                <Badge tone={TONE[detail.status]} dot>
                  {ROUTE_STATUS_LABEL[detail.status]}
                </Badge>
              </div>
              <div className="card-b">
                <div className="caption muted">
                  {detail.driver.name} · {detail.vehicle.plate} · {detail.date}
                </div>
                <div className="col">
                  {detail.stopsDetail.map((s) => (
                    <div key={s.id} className="line" style={{ alignItems: 'flex-start', padding: '10px 0' }}>
                      <div
                        className="stop-n"
                        style={{
                          background: s.status === 'ENTREGADA' ? 'var(--accent)' : s.status === 'NO_ENTREGADA' ? 'var(--danger)' : 'var(--border-strong)',
                        }}
                      >
                        {s.sequence}
                      </div>
                      <div className="grow col" style={{ gap: 2 }}>
                        <div className="small strong">{s.customer.name}</div>
                        <div className="caption muted">
                          Estimada {s.eta ?? '—'}
                          {s.arrivedAt ? ` · llegó ${hhmm(s.arrivedAt)}` : ''}
                          {s.deliveredAt ? ` · entregó ${hhmm(s.deliveredAt)}` : ''}
                        </div>
                        <div className="row gap8" style={{ flexWrap: 'wrap' }}>
                          {s.status === 'ENTREGADA' && (s.late ? <Badge tone="warn">Tardía</Badge> : <Badge tone="ok">A tiempo</Badge>)}
                          {s.status === 'NO_ENTREGADA' && <Badge tone="danger">{FAIL_LABEL[s.failReason ?? 'OTRO']}</Badge>}
                          {s.status === 'PENDIENTE' && <Badge>Pendiente</Badge>}
                          <span className="caption muted">
                            {s.paymentTerms} · {mxn(s.total)}
                            {s.collected > 0 ? ` · cobrado ${mxn(s.collected)}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {detail.incidents.length > 0 && (
                  <>
                    <span className="overline">Incidencias</span>
                    {detail.incidents.map((i) => (
                      <Notice key={i.id} tone="warn" icon="alert">
                        {i.description}
                      </Notice>
                    ))}
                  </>
                )}
                {detail.status === 'EN_CURSO' && (
                  <Link to="/rutas/mapa" className="btn secondary sm">
                    <Icon name="pin" size={15} /> Ver en el mapa
                  </Link>
                )}
                {detail.status === 'PROGRAMADA' && <Notice tone="info">El repartidor la verá en su app y deberá cargar el camión para salir.</Notice>}
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
