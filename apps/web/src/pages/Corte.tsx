import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { hhmm, mxn, PAY_LABEL, r2 } from '../lib/format';
import type { PayMethod, ShiftSummary } from '../lib/types';
import { usePos } from '../pos-context';
import { Badge, Button, Field, Icon, Kv, Modal, Notice, TextArea } from '../ui/kit';

const DENOMS = [1000, 500, 200, 100, 50, 20];
const METHODS: PayMethod[] = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO'];

export function Corte() {
  const pos = usePos();
  const sum = pos.shift!;
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<ShiftSummary | null>(null);

  useEffect(() => {
    void pos.reloadShift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counted = r2(DENOMS.reduce((a, d) => a + d * (Number(counts[d]) || 0), 0) + (Number(other) || 0));
  const diff = r2(counted - sum.expectedCash);
  const entered = counted > 0;

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const denominations: Record<string, number> = {};
      DENOMS.forEach((d) => Number(counts[d]) > 0 && (denominations[d] = Number(counts[d])));
      if (Number(other) > 0) denominations.otros = Number(other);
      const res = await api<ShiftSummary & { difference: number }>('POST', '/pos/shift/close', {
        countedCash: counted,
        notes: notes.trim() || undefined,
        denominations,
      });
      setClosed({ ...res, shift: { ...res.shift, countedCash: counted, difference: res.difference } });
      setConfirm(false);
    } catch (e) {
      setError(errMsg(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const view = closed ?? sum;
  return (
    <div className="page">
      <div className="grow print-area">
        <div className="card">
          <div className="card-h">
            <span className="title">Resumen del turno</span>
            <span className="caption muted">
              {hhmm(view.shift.openedAt)} – {closed ? hhmm(closed.shift.closedAt) : 'en curso'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              ['Fondo inicial', mxn(view.shift.openingFloat), ''],
              ['Ventas en efectivo', `+ ${mxn(view.byMethod.EFECTIVO.total)}`, 'var(--ok)'],
              ['Reembolsos en efectivo', `− ${mxn(view.cashRefunds)}`, 'var(--danger)'],
            ].map(([k, v, c]) => (
              <div key={k} className="row between" style={{ padding: '0 16px', height: 40, borderBottom: '1px solid var(--border)' }}>
                <span className="small muted2">{k}</span>
                <span className="small strong" style={c ? { color: c } : undefined}>
                  {v}
                </span>
              </div>
            ))}
            <div className="row between" style={{ padding: '0 16px', height: 48, background: 'var(--surface-2)', borderRadius: '0 0 10px 10px' }}>
              <span className="title">Efectivo esperado en caja</span>
              <span className="num" data-testid="expected">
                {mxn(view.expectedCash)}
              </span>
            </div>
          </div>
        </div>
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Forma de pago</th>
                <th className="right" style={{ width: 90 }}>
                  Ventas
                </th>
                <th className="right" style={{ width: 130 }}>
                  Importe
                </th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map((m) => (
                <tr key={m}>
                  <td>{PAY_LABEL[m]}</td>
                  <td className="right">{view.byMethod[m].count}</td>
                  <td className="right strong">{mxn(view.byMethod[m].total)}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">Total del turno</td>
                <td className="right strong">{view.salesCount}</td>
                <td className="right strong">{mxn(view.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {(view.cancelledCount > 0 || view.creditNotesTotal > 0) && (
          <div className="row gap8">
            {view.cancelledCount > 0 && (
              <Badge tone="danger">
                {view.cancelledCount} cancelada{view.cancelledCount === 1 ? '' : 's'}
              </Badge>
            )}
            {view.creditNotesTotal > 0 && <Badge tone="info">Notas de crédito {mxn(view.creditNotesTotal)}</Badge>}
          </div>
        )}
      </div>

      <aside className="card" style={{ width: 440, flex: 'none' }}>
        <div className="card-h">
          <span className="title">Arqueo de efectivo</span>
        </div>
        {closed ? (
          <div className="card-b">
            <Notice tone={closed.shift.difference === 0 ? 'ok' : 'warn'} icon={closed.shift.difference === 0 ? 'check' : 'alert'}>
              Turno cerrado a las {hhmm(closed.shift.closedAt)}.{' '}
              {closed.shift.difference === 0 ? 'La caja cuadra.' : `Diferencia de ${mxn(closed.shift.difference ?? 0)}.`}
            </Notice>
            <Kv k="Efectivo contado" v={mxn(closed.shift.countedCash ?? 0)} />
            <Kv k="Efectivo esperado" v={mxn(closed.expectedCash)} />
            <Kv k="Diferencia" v={mxn(closed.shift.difference ?? 0)} big tone={closed.shift.difference === 0 ? 'var(--ok)' : 'var(--warn)'} />
            <div className="row gap8" style={{ paddingTop: 4 }}>
              <Button icon="printer" onClick={() => window.print()}>
                Imprimir corte
              </Button>
              <Button variant="primary" onClick={() => void pos.reloadShift()}>
                Abrir nuevo turno
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              {DENOMS.map((d) => (
                <div key={d} className="row" style={{ padding: '0 16px', height: 46, borderBottom: '1px solid var(--border)' }}>
                  <span className="small grow">Billetes y monedas de {mxn(d).replace('.00', '')}</span>
                  <input
                    className="input"
                    style={{ width: 72, height: 32, padding: '0 10px', textAlign: 'right', fontWeight: 600 }}
                    inputMode="numeric"
                    value={counts[d] ?? ''}
                    placeholder="0"
                    aria-label={`Cantidad de ${d}`}
                    onChange={(e) => setCounts({ ...counts, [d]: e.target.value.replace(/\D/g, '') })}
                  />
                  <span className="small strong right" style={{ width: 90 }}>
                    {mxn(d * (Number(counts[d]) || 0))}
                  </span>
                </div>
              ))}
              <div className="row" style={{ padding: '0 16px', height: 46, borderBottom: '1px solid var(--border)' }}>
                <span className="small grow">Monedas y otros (importe)</span>
                <input
                  className="input"
                  style={{ width: 104, height: 32, padding: '0 10px', textAlign: 'right', fontWeight: 600 }}
                  inputMode="decimal"
                  value={other}
                  placeholder="0.00"
                  aria-label="Monedas y otros"
                  onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ''))}
                />
              </div>
            </div>
            <div className="card-b">
              <Kv k="Efectivo contado" v={mxn(counted)} big />
              <Kv k="Efectivo esperado" v={mxn(sum.expectedCash)} />
              <Kv k="Diferencia" v={entered ? mxn(diff) : '—'} big tone={!entered ? undefined : diff === 0 ? 'var(--ok)' : 'var(--warn)'} />
              <Field label="Observaciones">
                <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" maxLength={300} />
              </Field>
              {error && (
                <Notice tone="danger" icon="alert">
                  {error}
                </Notice>
              )}
              <div className="row gap8">
                <Button icon="printer" onClick={() => window.print()}>
                  Imprimir corte
                </Button>
                <Button variant="primary" className="grow" icon="lock" disabled={!entered} onClick={() => setConfirm(true)}>
                  Cerrar turno
                </Button>
              </div>
            </div>
          </>
        )}
      </aside>

      {confirm && (
        <Modal
          title="¿Cerrar el turno?"
          sub="Ya no podrás registrar ventas hasta abrir uno nuevo."
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button onClick={() => setConfirm(false)}>Volver</Button>
              <Button variant="primary" disabled={busy} onClick={close}>
                {busy ? 'Cerrando…' : 'Cerrar turno'}
              </Button>
            </>
          }
        >
          <Kv k="Efectivo contado" v={mxn(counted)} />
          <Kv k="Efectivo esperado" v={mxn(sum.expectedCash)} />
          <Kv k="Diferencia" v={mxn(diff)} big tone={diff === 0 ? 'var(--ok)' : 'var(--warn)'} />
          {diff !== 0 && (
            <Notice tone="warn" icon="alert">
              Hay una diferencia de {mxn(diff)}. Queda registrada en el corte.
            </Notice>
          )}
          <Icon name="lock" size={0} />
        </Modal>
      )}
    </div>
  );
}
