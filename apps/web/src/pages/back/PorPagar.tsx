import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { PAYABLE_LABEL, PAYABLE_TONE, type Payable, type PayablesData } from '../../lib/compras-types';
import { mxn } from '../../lib/format';
import { Badge, Button, Empty, Field, Input, Modal, Notice, Segmented } from '../../ui/kit';

type Scope = 'ABIERTAS' | 'VENCIDA' | 'POR_VENCER' | 'PAGADA';
const day = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const due = (p: Payable) =>
  p.status === 'PAGADA'
    ? ''
    : p.daysToDue < 0
      ? `hace ${-p.daysToDue} día${p.daysToDue === -1 ? '' : 's'}`
      : p.daysToDue === 0
        ? 'hoy'
        : `en ${p.daysToDue} día${p.daysToDue === 1 ? '' : 's'}`;

/** COM-006 y COM-007: cuentas por pagar con vencimiento y aviso de pagos próximos. */
export function PorPagar() {
  const [scope, setScope] = useState<Scope>('ABIERTAS');
  const [data, setData] = useState<PayablesData | null>(null);
  const [paying, setPaying] = useState<Payable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<PayablesData>('GET', `/purchasing/payables?status=${scope}`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [scope]);
  useEffect(() => void load(), [load]);

  const t = data?.totals;
  return (
    <>
      <div>
        <h1 className="h1">Cuentas por pagar</h1>
        <div className="small muted">Cada recepción de mercancía genera una cuenta con vencimiento según las condiciones del proveedor.</div>
      </div>
      {t && (
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="card kpi">
            <span className="overline">Saldo por pagar</span>
            <span className="num-lg">{mxn(t.open)}</span>
            <span className="caption muted">Todas las cuentas abiertas</span>
          </div>
          <div className="card kpi">
            <span className="overline">Vencido</span>
            <span className="num-lg" style={{ color: t.overdue > 0 ? 'var(--danger)' : undefined }} data-testid="kpi-overdue">
              {mxn(t.overdue)}
            </span>
            <span className="caption muted">Fecha límite ya pasada</span>
          </div>
          <div className="card kpi">
            <span className="overline">Vence en 7 días</span>
            <span className="num-lg" style={{ color: t.dueSoon > 0 ? 'var(--warn)' : undefined }}>
              {mxn(t.dueSoon)}
            </span>
            <span className="caption muted">Conviene programar el pago</span>
          </div>
        </div>
      )}
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      <div style={{ alignSelf: 'flex-start' }}>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            ['ABIERTAS', 'Abiertas'],
            ['VENCIDA', 'Vencidas'],
            ['POR_VENCER', 'Por vencer'],
            ['PAGADA', 'Pagadas'],
          ]}
        />
      </div>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th style={{ width: 100 }}>Orden</th>
              <th style={{ width: 160 }}>Vencimiento</th>
              <th className="right" style={{ width: 110 }}>
                Importe
              </th>
              <th className="right" style={{ width: 110 }}>
                Saldo
              </th>
              <th style={{ width: 110 }}>Estado</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((p) => (
              <tr key={p.id}>
                <td className="strong">{p.supplier}</td>
                <td className="muted">{p.folio}</td>
                <td>
                  {day(p.dueDate)}
                  <div className="caption muted">{due(p)}</div>
                </td>
                <td className="right">{mxn(p.amount)}</td>
                <td className="right strong">{mxn(p.balance)}</td>
                <td>
                  <Badge tone={PAYABLE_TONE[p.status]} dot>
                    {PAYABLE_LABEL[p.status]}
                  </Badge>
                </td>
                <td className="right">
                  {p.status !== 'PAGADA' && (
                    <Button size="sm" onClick={() => setPaying(p)}>
                      Registrar pago
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <Empty icon="wallet" title="Sin cuentas">
            No hay cuentas en esta vista.
          </Empty>
        )}
      </div>
      {paying && (
        <PayModal
          payable={paying}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function PayModal({ payable, onClose, onDone }: { payable: Payable; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(payable.balance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(amount);
    if (!(n > 0)) return setError('Escribe un monto mayor a 0');
    if (n > payable.balance) return setError(`El pago excede el saldo (${mxn(payable.balance)})`);
    setBusy(true);
    try {
      await api('POST', `/purchasing/payables/${payable.id}/pay`, { amount: n });
      onDone();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Registrar pago"
      sub={`${payable.supplier} · ${payable.folio} · saldo ${mxn(payable.balance)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={busy} onClick={save}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="col gap12">
        <Field label="Monto pagado">
          <Input prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
        </Field>
        <div className="caption muted">Un pago menor al saldo deja la cuenta abierta con lo que falta.</div>
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
      </div>
    </Modal>
  );
}
