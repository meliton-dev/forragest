import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { hhmm, mxn } from '../../lib/format';
import { ROUTE_STATUS_LABEL } from '../../lib/routes-types';
import { Badge, Empty, Notice } from '../../ui/kit';

/** Respuesta de GET /reports/sales: lo vendido en un día, en mostrador (por caja) y en reparto (por ruta). */
interface SalesReport {
  date: string;
  total: number;
  counter: {
    count: number;
    cancelled: number;
    total: number;
    refunds: number;
    byMethod: Record<'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CREDITO', number>;
    byRegister: {
      register: string;
      cashiers: string[];
      count: number;
      cancelled: number;
      total: number;
      refunds: number;
      net: number;
      byMethod: Record<'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CREDITO', number>;
    }[];
  };
  shifts: {
    id: number;
    register: string;
    cashier: string;
    status: 'ABIERTO' | 'CERRADO';
    openedAt: string;
    closedAt: string | null;
    openingFloat: number;
    salesCount: number;
    total: number;
    expectedCash: number;
    countedCash: number | null;
    difference: number | null;
  }[];
  delivery: {
    routes: number;
    delivered: number;
    planned: number;
    collected: number;
    cash: number;
    byRoute: {
      id: number;
      name: string;
      status: string;
      driver: string;
      plate: string;
      stops: { total: number; delivered: number; failed: number };
      planned: number;
      delivered: number;
      collected: { EFECTIVO: number; TRANSFERENCIA: number; TARJETA: number };
      collectedTotal: number;
    }[];
  };
}

/** Fecha de hoy en la computadora (AAAA-MM-DD), para el selector. */
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const shiftDay = (iso: string, days: number) => new Date(new Date(iso + 'T12:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);
const longDate = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function Ventas() {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    api<SalesReport>('GET', `/reports/sales?date=${date}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [date]);

  const c = data?.counter;
  const d = data?.delivery;
  return (
    <>
      <div className="row between gap12" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1 className="h1">Ventas</h1>
          <div className="small muted">Lo vendido en mostrador (por caja) y en reparto (por ruta) · {longDate(date)}</div>
        </div>
        <div className="row gap8">
          <button type="button" className="btn secondary sm" onClick={() => setDate(shiftDay(date, -1))} aria-label="Día anterior">
            ‹
          </button>
          <div className="input" style={{ height: 38 }}>
            <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Fecha" />
          </div>
          <button type="button" className="btn secondary sm" onClick={() => setDate(shiftDay(date, 1))} disabled={date >= today()} aria-label="Día siguiente">
            ›
          </button>
          {date !== today() && (
            <button type="button" className="btn secondary sm" onClick={() => setDate(today())}>
              Hoy
            </button>
          )}
        </div>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      {!data && !error && <div className="small muted">Cargando…</div>}

      {data && c && d && (
        <>
          <div className="kpis">
            <div className="card kpi">
              <span className="overline">Total del día</span>
              <span className="num-lg">{mxn(data.total)}</span>
              <span className="caption muted">Mostrador neto + entregado en ruta</span>
            </div>
            <div className="card kpi">
              <span className="overline">Mostrador</span>
              <span className="num-lg">{mxn(c.total - c.refunds)}</span>
              <span className="caption muted">
                {c.count} venta{c.count === 1 ? '' : 's'}
                {c.refunds > 0 && ` · ${mxn(c.refunds)} devuelto`}
                {c.cancelled > 0 && ` · ${c.cancelled} cancelada${c.cancelled === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className="card kpi">
              <span className="overline">Reparto entregado</span>
              <span className="num-lg">{mxn(d.delivered)}</span>
              <span className="caption muted">
                {d.routes} ruta{d.routes === 1 ? '' : 's'} · plan {mxn(d.planned)}
              </span>
            </div>
            <div className="card kpi">
              <span className="overline">Cobrado en ruta</span>
              <span className="num-lg">{mxn(d.collected)}</span>
              <span className="caption muted">{mxn(d.cash)} en efectivo por entregar a caja</span>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="title">Mostrador por caja</span>
            </div>
            <div className="tw" style={{ border: 0, borderRadius: 0 }}>
              <table className="t" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Cajeros</th>
                    <th className="right">Ventas</th>
                    <th className="right">Efectivo</th>
                    <th className="right">Transferencia</th>
                    <th className="right">Tarjeta</th>
                    <th className="right">Crédito</th>
                    <th className="right">Devoluciones</th>
                    <th className="right">Total neto</th>
                  </tr>
                </thead>
                <tbody>
                  {c.byRegister.map((g) => (
                    <tr key={g.register}>
                      <td className="strong">{g.register}</td>
                      <td className="muted">{g.cashiers.join(', ')}</td>
                      <td className="right">
                        {g.count}
                        {g.cancelled > 0 && (
                          <div className="caption muted">
                            {g.cancelled} cancelada{g.cancelled === 1 ? '' : 's'}
                          </div>
                        )}
                      </td>
                      <td className="right">{mxn(g.byMethod.EFECTIVO)}</td>
                      <td className="right">{mxn(g.byMethod.TRANSFERENCIA)}</td>
                      <td className="right">{mxn(g.byMethod.TARJETA)}</td>
                      <td className="right">{mxn(g.byMethod.CREDITO)}</td>
                      <td className="right muted">{g.refunds ? `− ${mxn(g.refunds)}` : '—'}</td>
                      <td className="right strong">{mxn(g.net)}</td>
                    </tr>
                  ))}
                  {c.byRegister.length > 1 && (
                    <tr>
                      <td className="strong">Total</td>
                      <td />
                      <td className="right strong">{c.count}</td>
                      <td className="right strong">{mxn(c.byMethod.EFECTIVO)}</td>
                      <td className="right strong">{mxn(c.byMethod.TRANSFERENCIA)}</td>
                      <td className="right strong">{mxn(c.byMethod.TARJETA)}</td>
                      <td className="right strong">{mxn(c.byMethod.CREDITO)}</td>
                      <td className="right strong">{c.refunds ? `− ${mxn(c.refunds)}` : '—'}</td>
                      <td className="right strong">{mxn(c.total - c.refunds)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {c.byRegister.length === 0 && (
                <Empty icon="receipt" title="Sin ventas de mostrador">
                  Ese día no se vendió en caja.
                </Empty>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="title">Turnos y cortes de caja</span>
            </div>
            <div className="tw" style={{ border: 0, borderRadius: 0 }}>
              <table className="t" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Cajero</th>
                    <th>Horario</th>
                    <th>Estado</th>
                    <th className="right">Ventas</th>
                    <th className="right">Efectivo esperado</th>
                    <th className="right">Contado</th>
                    <th className="right">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.shifts.map((s) => (
                    <tr key={s.id}>
                      <td className="strong">{s.register}</td>
                      <td>{s.cashier}</td>
                      <td className="muted">
                        {hhmm(s.openedAt)} – {s.closedAt ? hhmm(s.closedAt) : 'en curso'}
                      </td>
                      <td>
                        <Badge tone={s.status === 'ABIERTO' ? 'warn' : 'ok'} dot>
                          {s.status === 'ABIERTO' ? 'Abierto' : 'Cerrado'}
                        </Badge>
                      </td>
                      <td className="right">
                        {mxn(s.total)}
                        <div className="caption muted">
                          {s.salesCount} venta{s.salesCount === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="right">{mxn(s.expectedCash)}</td>
                      <td className="right">{s.countedCash === null ? '—' : mxn(s.countedCash)}</td>
                      <td
                        className="right strong"
                        style={{ color: s.difference === null || s.difference === 0 ? undefined : s.difference < 0 ? 'var(--danger)' : 'var(--warn)' }}
                      >
                        {s.difference === null ? '—' : s.difference === 0 ? 'Cuadra' : `${s.difference > 0 ? '+' : '−'} ${mxn(Math.abs(s.difference))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.shifts.length === 0 && (
                <Empty icon="wallet" title="Sin turnos">
                  Nadie abrió caja ese día.
                </Empty>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="title">Reparto por ruta</span>
            </div>
            <div className="tw" style={{ border: 0, borderRadius: 0 }}>
              <table className="t" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>Ruta</th>
                    <th>Chofer</th>
                    <th>Estado</th>
                    <th className="right">Paradas</th>
                    <th className="right">Entregado</th>
                    <th className="right">Cobrado efectivo</th>
                    <th className="right">Transferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byRoute.map((r) => (
                    <tr key={r.id}>
                      <td className="strong">
                        {r.name}
                        <div className="caption muted">{r.plate}</div>
                      </td>
                      <td>{r.driver}</td>
                      <td>
                        <Badge tone={r.status === 'FINALIZADA' ? 'ok' : r.status === 'EN_CURSO' ? 'info' : 'neutral'} dot>
                          {ROUTE_STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="right">
                        {r.stops.delivered} de {r.stops.total}
                        {r.stops.failed > 0 && <div className="caption muted">{r.stops.failed} sin entregar</div>}
                      </td>
                      <td className="right strong">
                        {mxn(r.delivered)}
                        <div className="caption muted">plan {mxn(r.planned)}</div>
                      </td>
                      <td className="right">{mxn(r.collected.EFECTIVO)}</td>
                      <td className="right">{mxn(r.collected.TRANSFERENCIA + r.collected.TARJETA)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.byRoute.length === 0 && (
                <Empty icon="truck" title="Sin rutas">
                  Ese día no hubo reparto.
                </Empty>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
