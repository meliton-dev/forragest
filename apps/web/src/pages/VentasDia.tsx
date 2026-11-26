import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { folio, hhmm, mxn, PAY_LABEL, STATUS_LABEL } from '../lib/format';
import type { Sale, SaleRow } from '../lib/types';
import { usePos } from '../pos-context';
import { Badge, Button, Empty, Field, Icon, Input, Kv, Modal, Notice, Segmented, TextArea } from '../ui/kit';
import { ReceiptModal, SaleReceipt } from '../ui/Receipt';

const FILTERS: [string, string][] = [
  ['', 'Todas'],
  ['PAGADA', 'Pagadas'],
  ['POR_COBRAR', 'A crédito'],
  ['CANCELADA', 'Canceladas'],
];
const TONE: Record<string, 'ok' | 'warn' | 'danger'> = { PAGADA: 'ok', POR_COBRAR: 'warn', CANCELADA: 'danger' };

export function VentasDia() {
  const pos = usePos();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [register, setRegister] = useState('');
  // cajas que han vendido hoy (se recuerdan aunque el filtro esconda las demás)
  const [registers, setRegisters] = useState<string[]>([]);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [print, setPrint] = useState(false);
  const [cancel, setCancel] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<SaleRow[]>('GET', `/pos/sales?q=${encodeURIComponent(q)}&status=${status}&register=${encodeURIComponent(register)}`);
      setRows(r);
      setRegisters((cur) => [...new Set([...cur, ...r.map((x) => x.register)])].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
      setError(null);
      setSelId((cur) => (cur && r.some((x) => x.id === cur) ? cur : (r[0]?.id ?? null)));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [q, status, register]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (selId === null) return setSale(null);
    api<Sale>('GET', `/pos/sales/${selId}`)
      .then(setSale)
      .catch((e) => setError(errMsg(e)));
  }, [selId, rows]);

  return (
    <div className="page">
      <div className="grow">
        <div className="row between gap8" style={{ flexWrap: 'wrap' }}>
          <Segmented value={status} onChange={setStatus} options={FILTERS} />
          <div className="input" style={{ width: 150, height: 38 }}>
            <select value={register} onChange={(e) => setRegister(e.target.value)} aria-label="Filtrar por caja">
              <option value="">Todas las cajas</option>
              {registers.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="input" style={{ width: 240, height: 38 }}>
            <Icon name="search" size={15} color="var(--text-3)" />
            <input placeholder="Folio o cliente" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar venta" />
          </div>
        </div>
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Folio</th>
                <th style={{ width: 70 }}>Hora</th>
                <th style={{ width: 130 }}>Caja</th>
                <th>Cliente</th>
                <th style={{ width: 130 }}>Pago</th>
                <th className="right" style={{ width: 110 }}>
                  Total
                </th>
                <th style={{ width: 120 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`click ${selId === r.id ? 'sel' : ''}`} onClick={() => setSelId(r.id)}>
                  <td className="muted">{folio(r.folio)}</td>
                  <td className="muted">{hhmm(r.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.register}
                    <div className="caption muted">{r.cashier}</div>
                  </td>
                  <td className="strong">{r.customer}</td>
                  <td>
                    <Badge>{PAY_LABEL[r.paymentMethod]}</Badge>
                  </td>
                  <td className="right strong">{mxn(r.total)}</td>
                  <td>
                    <Badge tone={TONE[r.status]} dot>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <Empty icon="receipt" title="Sin ventas">
              No hay ventas con este filtro hoy.
            </Empty>
          )}
        </div>
      </div>

      <aside className="card" style={{ width: 360, flex: 'none' }}>
        {!sale ? (
          <Empty icon="receipt" title="Selecciona una venta" />
        ) : (
          <>
            <div className="card-h">
              <span className="title">Venta {folio(sale.folio)}</span>
              <Badge tone={TONE[sale.status]} dot>
                {STATUS_LABEL[sale.status]}
              </Badge>
            </div>
            <div className="card-b">
              <div className="caption muted">
                {new Date(sale.createdAt).toLocaleString('es-MX')} · {sale.register} · {sale.cashier}
              </div>
              {sale.customer && <div className="small strong">Cliente: {sale.customer.name}</div>}
              <div>
                {sale.items.map((i) => (
                  <div key={i.id} className="line" style={{ padding: '8px 0' }}>
                    <div className="grow">
                      <div className="small strong">
                        {i.quantity} × {i.name}
                      </div>
                      <div className="caption muted">
                        {i.presentation} · {mxn(i.unitPrice)}
                        {i.returnedQty > 0 ? ` · devueltos ${i.returnedQty}` : ''}
                      </div>
                    </div>
                    <span className="small strong">{mxn(i.total)}</span>
                  </div>
                ))}
              </div>
              <Kv k="Subtotal" v={mxn(sale.subtotal)} />
              {sale.discountAmount > 0 && <Kv k="Descuento" v={`− ${mxn(sale.discountAmount)}`} tone="var(--ok)" />}
              {sale.received !== null && <Kv k="Recibido" v={mxn(sale.received)} />}
              {sale.change !== null && sale.paymentMethod === 'EFECTIVO' && <Kv k="Cambio" v={mxn(sale.change)} />}
              {sale.paymentMethod === 'CREDITO' && <Kv k="Saldo por cobrar" v={mxn(sale.balance)} tone="var(--warn)" />}
              <Kv k="Total" v={mxn(sale.total)} big />
              {sale.cancelReason && (
                <Notice tone="danger" icon="x">
                  Cancelada: {sale.cancelReason}
                </Notice>
              )}
              {sale.creditNotes.map((n) => (
                <Notice key={n.id} tone="info" icon="undo">
                  Nota de crédito {folio(n.folio)} por {mxn(n.total)}
                </Notice>
              ))}
              <div className="col gap8" style={{ paddingTop: 4 }}>
                <Button icon="printer" onClick={() => setPrint(true)}>
                  Reimprimir ticket
                </Button>
                <Button icon="x" disabled={sale.status === 'CANCELADA' || sale.creditNotes.length > 0} onClick={() => setCancel(true)}>
                  Cancelar venta
                </Button>
                <div className="caption muted">Cancelar requiere autorización de supervisor y queda en la bitácora.</div>
              </div>
            </div>
          </>
        )}
      </aside>

      {print && sale && (
        <ReceiptModal
          title={`Ticket ${folio(sale.folio)}`}
          onClose={() => setPrint(false)}
          extra={<span />}
          render={(mm) => <SaleReceipt sale={sale} mm={mm} />}
        />
      )}
      {cancel && sale && (
        <CancelModal
          sale={sale}
          onClose={() => setCancel(false)}
          onDone={() => {
            setCancel(false);
            void load();
            void pos.reloadShift();
            pos.bumpCatalog();
          }}
        />
      )}
    </div>
  );
}

function CancelModal({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/pos/sales/${sale.id}/cancel`, { reason: reason.trim(), authorization: { username: username.trim(), password } });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Cancelar venta ${folio(sale.folio)}`}
      sub={`${mxn(sale.total)} · el producto regresa al inventario`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Volver</Button>
          <Button variant="danger" disabled={busy || reason.trim().length < 3 || !username || !password} onClick={submit}>
            {busy ? 'Cancelando…' : 'Cancelar venta'}
          </Button>
        </>
      }
    >
      <Field label="Motivo de la cancelación">
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej. Error de captura"
          maxLength={300}
          aria-label="Motivo de la cancelación"
        />
      </Field>
      <span className="overline row gap4">
        <Icon name="lock" size={13} /> Autorización de supervisor
      </span>
      <div className="row gap12">
        <div className="grow">
          <Field label="Usuario">
            <Input icon="user" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" aria-label="Usuario del supervisor" />
          </Field>
        </div>
        <div className="grow">
          <Field label="Contraseña">
            <Input icon="lock" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Contraseña del supervisor" />
          </Field>
        </div>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
