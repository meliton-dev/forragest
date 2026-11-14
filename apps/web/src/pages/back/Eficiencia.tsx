import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { mxn } from '../../lib/format';
import { FAIL_LABEL, type Efficiency } from '../../lib/routes-types';
import { Empty, Notice, Segmented } from '../../ui/kit';

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function Eficiencia() {
  const [days, setDays] = useState('7');
  const [data, setData] = useState<Efficiency | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const to = new Date();
    const from = new Date(to.getTime() - (Number(days) - 1) * 86400000);
    api<Efficiency>('GET', `/routes/efficiency?from=${iso(from)}&to=${iso(to)}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errMsg(e)));
  }, [days]);

  const k = data?.kpis;
  const max = Math.max(1, ...(data?.perDay ?? []).map((d) => d.onTime + d.late + d.failed));
  const reasons = Object.entries(data?.reasons ?? {});
  const maxReason = Math.max(1, ...reasons.map(([, v]) => v));

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Eficiencia de entregas</h1>
          <div className="small muted">
            Entregas a tiempo vs. tardías · se considera tardía una llegada con más de {data?.toleranceMin ?? 15} min sobre la hora estimada
          </div>
        </div>
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            ['7', '7 días'],
            ['14', '14 días'],
            ['30', '30 días'],
          ]}
        />
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}

      {k && (
        <>
          <div className="kpis">
            <div className="card kpi">
              <span className="overline">Entregas a tiempo</span>
              <span className="num-lg" style={{ color: k.onTimePct !== null && k.onTimePct >= 85 ? 'var(--ok)' : 'var(--warn)' }} data-testid="kpi-ontime">
                {k.onTimePct === null ? '—' : `${k.onTimePct} %`}
              </span>
              <span className="caption muted">
                {k.onTime} de {k.delivered} entregas
              </span>
            </div>
            <div className="card kpi">
              <span className="overline">Entregas tardías</span>
              <span className="num-lg" style={{ color: 'var(--warn)' }}>
                {k.latePct === null ? '—' : `${k.latePct} %`}
              </span>
              <span className="caption muted">{k.late} entregas</span>
            </div>
            <div className="card kpi">
              <span className="overline">Tiempo por parada</span>
              <span className="num-lg">{k.avgMinutes === null ? '—' : `${k.avgMinutes} min`}</span>
              <span className="caption muted">De la llegada a la entrega</span>
            </div>
            <div className="card kpi">
              <span className="overline">No entregadas</span>
              <span className="num-lg" style={{ color: k.failed ? 'var(--danger)' : undefined }}>
                {k.failed}
              </span>
              <span className="caption muted">de {k.stops} paradas atendidas</span>
            </div>
          </div>

          <div className="split">
            <div className="card grow" style={{ flex: 1 }}>
              <div className="card-h">
                <span className="title">A tiempo vs. tardías por día</span>
              </div>
              <div className="card-b">
                <div className="row gap16">
                  {[
                    ['A tiempo', 'var(--ok)'],
                    ['Tardías', 'var(--warn)'],
                    ['No entregadas', 'var(--danger)'],
                  ].map(([n, c]) => (
                    <span key={n} className="row gap4 caption muted2">
                      <i style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />
                      {n}
                    </span>
                  ))}
                </div>
                <div className="bar-chart">
                  {data.perDay.map((d) => {
                    const dt = new Date(d.date + 'T12:00:00');
                    const h = (n: number) => Math.round((n / max) * 150);
                    return (
                      <div key={d.date} className="bar-col" title={`${d.date}: ${d.onTime} a tiempo, ${d.late} tardías, ${d.failed} no entregadas`}>
                        <div className="bar-stack">
                          {d.failed > 0 && <i style={{ height: h(d.failed), background: 'var(--danger)' }} />}
                          {d.late > 0 && <i style={{ height: h(d.late), background: 'var(--warn)' }} />}
                          {d.onTime > 0 && <i style={{ height: h(d.onTime), background: 'var(--ok)' }} />}
                        </div>
                        <span className="caption muted">{Number(days) <= 7 ? DOW[dt.getDay()] : `${dt.getDate()}/${dt.getMonth() + 1}`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="card" style={{ width: 340, flex: 'none' }}>
              <div className="card-h">
                <span className="title">Motivos de no entrega</span>
              </div>
              <div className="card-b" style={{ gap: 14 }}>
                {reasons.length === 0 && <div className="small muted">Sin no entregas en el periodo.</div>}
                {reasons.map(([r, v]) => (
                  <div key={r} className="col gap4">
                    <div className="row between">
                      <span className="small strong">{FAIL_LABEL[r] ?? r}</span>
                      <span className="small strong">{v}</span>
                    </div>
                    <div className="hbar">
                      <i style={{ width: `${(v / maxReason) * 100}%`, background: 'var(--danger)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Repartidor</th>
                  <th className="right" style={{ width: 70 }}>
                    Rutas
                  </th>
                  <th className="right" style={{ width: 90 }}>
                    Paradas
                  </th>
                  <th className="right" style={{ width: 100 }}>
                    A tiempo
                  </th>
                  <th className="right" style={{ width: 90 }}>
                    Tardías
                  </th>
                  <th className="right" style={{ width: 120 }}>
                    No entregadas
                  </th>
                  <th className="right" style={{ width: 130 }}>
                    Tiempo / parada
                  </th>
                  <th className="right" style={{ width: 120 }}>
                    Cobrado
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.perDriver.map((d) => (
                  <tr key={d.driverId}>
                    <td className="strong">{d.name}</td>
                    <td className="right">{d.routes}</td>
                    <td className="right">{d.stops}</td>
                    <td className="right strong">{d.onTimePct === null ? '—' : `${d.onTimePct} %`}</td>
                    <td className="right">{d.late}</td>
                    <td className="right">{d.failed}</td>
                    <td className="right">{d.avgMinutes === null ? '—' : `${d.avgMinutes} min`}</td>
                    <td className="right strong">{mxn(d.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.perDriver.length === 0 && <Empty icon="chart" title="Sin entregas en el periodo" />}
          </div>
        </>
      )}
    </>
  );
}
