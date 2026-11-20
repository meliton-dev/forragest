import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import { PAYABLE_LABEL, PAYABLE_TONE, PURCHASE_LABEL, PURCHASE_TONE, type OrderDetail, type OrderRow } from '../../lib/compras-types';
import { diaCalendario, diaCorto as day, mxn } from '../../lib/format';
import { Badge, Button, Empty, Field, Icon, Input, Modal, Notice, Segmented } from '../../ui/kit';

type Scope = 'ABIERTAS' | 'RECIBIDA' | 'TODAS';
const kg = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });

export function Ordenes() {
  const initial = (useLocation().state as { selectId?: number } | null)?.selectId ?? null;
  const [scope, setScope] = useState<Scope>('ABIERTAS');
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [selId, setSelId] = useState<number | null>(initial);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<OrderRow[]>('GET', '/purchasing/orders'));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const visible = (rows ?? []).filter((r) =>
    scope === 'TODAS'
      ? true
      : scope === 'RECIBIDA'
        ? r.status === 'RECIBIDA' || r.status === 'CANCELADA'
        : ['BORRADOR', 'ENVIADA', 'PARCIAL'].includes(r.status),
  );
  const sel = selId ?? visible[0]?.id ?? null;

  useEffect(() => {
    if (sel === null) return setDetail(null);
    api<OrderDetail>('GET', `/purchasing/orders/${sel}`)
      .then(setDetail)
      .catch((e) => setError(errMsg(e)));
  }, [sel, rows]);

  async function act(path: string) {
    if (!detail) return;
    setBusy(true);
    try {
      await api('POST', `/purchasing/orders/${detail.id}/${path}`);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Órdenes de compra</h1>
          <div className="small muted">Pedidos a proveedores y recepción de mercancía.</div>
        </div>
        <div className="row gap8">
          <Link to="/compras/sugerencias" className="btn secondary">
            <Icon name="refresh" size={16} /> Sugerencias
          </Link>
          <Link to="/compras/nueva" className="btn primary">
            <Icon name="plus" size={16} sw={2} /> Nueva orden
          </Link>
        </div>
      </div>
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
                ['ABIERTAS', 'En proceso'],
                ['RECIBIDA', 'Cerradas'],
                ['TODAS', 'Todas'],
              ]}
            />
          </div>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Folio</th>
                  <th>Proveedor</th>
                  <th style={{ width: 110 }}>Fecha</th>
                  <th className="right" style={{ width: 110 }}>
                    Total
                  </th>
                  <th style={{ width: 150 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={`click ${sel === r.id ? 'sel' : ''}`} onClick={() => setSelId(r.id)}>
                    <td className="strong">{r.folio}</td>
                    <td>
                      {r.supplier.name}
                      <div className="caption muted">
                        {r.itemCount} producto{r.itemCount === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="muted">{day(r.createdAt)}</td>
                    <td className="right strong">{mxn(r.total)}</td>
                    <td>
                      <Badge tone={PURCHASE_TONE[r.status]} dot>
                        {PURCHASE_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows && visible.length === 0 && (
              <Empty icon="receipt" title="Sin órdenes">
                No hay órdenes en esta vista.
              </Empty>
            )}
          </div>
        </div>

        <aside className="card" style={{ width: 400, flex: 'none' }}>
          {!detail ? (
            <Empty icon="receipt" title="Selecciona una orden" />
          ) : (
            <>
              <div className="card-h">
                <span className="title">{detail.folio}</span>
                <Badge tone={PURCHASE_TONE[detail.status]} dot>
                  {PURCHASE_LABEL[detail.status]}
                </Badge>
              </div>
              <div className="card-b">
                <div className="caption muted">
                  {detail.supplier.name} · {detail.supplier.paymentDays === 0 ? 'contado' : `crédito ${detail.supplier.paymentDays} días`}
                  {detail.expectedAt ? ` · entrega esperada ${diaCalendario(detail.expectedAt)}` : ''}
                </div>
                <div className="col">
                  {detail.items.map((i) => (
                    <div key={i.id} className="line" style={{ alignItems: 'flex-start', padding: '8px 0' }}>
                      <div className="grow col" style={{ gap: 2 }}>
                        <div className="small strong">{i.name}</div>
                        <div className="caption muted">
                          Pedido {kg(i.ordered)} {i.unit} · recibido {kg(i.received)} · {mxn(i.unitCost)}/{i.unit}
                        </div>
                      </div>
                      {detail.status !== 'BORRADOR' &&
                        detail.status !== 'CANCELADA' &&
                        (i.pending > 0 ? (
                          <Badge tone={detail.status === 'RECIBIDA' ? 'danger' : 'warn'}>Faltan {kg(i.pending)}</Badge>
                        ) : (
                          <Badge tone="ok">Completo</Badge>
                        ))}
                    </div>
                  ))}
                </div>
                <div className="kv">
                  <span className="small muted2">Total pedido</span>
                  <span className="small strong">{mxn(detail.total)}</span>
                </div>
                {detail.receivedTotal > 0 && (
                  <div className="kv">
                    <span className="small muted2">Total recibido</span>
                    <span className="small strong">{mxn(detail.receivedTotal)}</span>
                  </div>
                )}
                {detail.shortage.length > 0 && (
                  <Notice tone="warn" icon="alert">
                    Se cerró con faltante: {detail.shortage.map((s) => `${kg(s.missing)} kg de ${s.name}`).join(', ')}.
                  </Notice>
                )}
                {detail.notes && <div className="small muted2">Notas: {detail.notes}</div>}

                {detail.receipts.length > 0 && (
                  <>
                    <span className="overline">Recepciones</span>
                    {detail.receipts.map((r) => (
                      <div key={r.id} className="col" style={{ gap: 2 }}>
                        <div className="small strong">{day(r.createdAt)}</div>
                        {r.items.map((ri) => {
                          const it = detail.items.find((x) => x.id === ri.orderItemId);
                          return (
                            <div key={ri.orderItemId} className="caption muted">
                              {kg(ri.quantity)} {it?.unit} de {it?.name}
                              {ri.note ? ` — ${ri.note}` : ''}
                            </div>
                          );
                        })}
                        {r.notes && <div className="caption muted">{r.notes}</div>}
                      </div>
                    ))}
                  </>
                )}
                {detail.payables.length > 0 && (
                  <>
                    <span className="overline">Cuentas por pagar</span>
                    {detail.payables.map((p) => (
                      <div key={p.id} className="kv">
                        <span className="small muted2">
                          {mxn(p.amount)} · vence {diaCalendario(p.dueDate)}
                        </span>
                        <Badge tone={PAYABLE_TONE[p.status]}>{PAYABLE_LABEL[p.status]}</Badge>
                      </div>
                    ))}
                  </>
                )}

                <div className="row gap8" style={{ flexWrap: 'wrap' }}>
                  {detail.status === 'BORRADOR' && (
                    <Button variant="primary" icon="send" disabled={busy} onClick={() => act('send')}>
                      Enviar al proveedor
                    </Button>
                  )}
                  {(detail.status === 'ENVIADA' || detail.status === 'PARCIAL') && (
                    <Button variant="primary" icon="box" onClick={() => setReceiving(true)}>
                      Recibir mercancía
                    </Button>
                  )}
                  {(detail.status === 'BORRADOR' || (detail.status === 'ENVIADA' && detail.receipts.length === 0)) && (
                    <Button icon="x" disabled={busy} onClick={() => confirm(`¿Cancelar la orden ${detail.folio}?`) && void act('cancel')}>
                      Cancelar orden
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      {receiving && detail && (
        <ReceiveModal
          order={detail}
          onClose={() => setReceiving(false)}
          onDone={() => {
            setReceiving(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function ReceiveModal({ order, onClose, onDone }: { order: OrderDetail; onClose: () => void; onDone: () => void }) {
  const open = order.items.filter((i) => i.pending > 0);
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(open.map((i) => [i.id, String(i.pending)])));
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [general, setGeneral] = useState('');
  const [closeShort, setCloseShort] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const got = (id: number) => Number(qty[id]) || 0;
  const amount = open.reduce((a, i) => a + got(i.id) * i.unitCost, 0);
  const short = open.filter((i) => got(i.id) < i.pending);

  async function save() {
    const bad = open.find((i) => got(i.id) < 0 || got(i.id) > i.pending);
    if (bad) return setError(`${bad.name}: la cantidad debe estar entre 0 y ${kg(bad.pending)}`);
    if (!open.some((i) => got(i.id) > 0)) return setError('Indica al menos un producto recibido');
    const missingNote = short.find((i) => got(i.id) < i.pending && !(notes[i.id] ?? '').trim());
    if (missingNote) return setError(`Anota el motivo de la diferencia en ${missingNote.name} (faltante, daño, etc.)`);
    setBusy(true);
    try {
      await api('POST', `/purchasing/orders/${order.id}/receive`, {
        notes: general.trim() || undefined,
        closeShort,
        items: open.map((i) => ({ orderItemId: i.id, quantity: got(i.id), note: (notes[i.id] ?? '').trim() || undefined })),
      });
      onDone();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={`Recibir mercancía · ${order.folio}`}
      sub="Captura lo que realmente llegó. Entra al inventario con el precio acordado y genera la cuenta por pagar."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={busy} onClick={save}>
            Registrar recepción · {mxn(amount)}
          </Button>
        </>
      }
    >
      <div className="col gap12">
        {open.map((i) => (
          <div key={i.id} className="row gap12" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="small strong">{i.name}</div>
              <div className="caption muted">
                Pendiente {kg(i.pending)} {i.unit} · {mxn(i.unitCost)}/{i.unit}
              </div>
            </div>
            <div style={{ width: 130 }}>
              <Field label="Recibido">
                <Input
                  inputMode="decimal"
                  value={qty[i.id] ?? ''}
                  onChange={(e) => setQty({ ...qty, [i.id]: e.target.value.replace(/[^\d.]/g, '') })}
                  aria-label={`Recibido de ${i.name}`}
                />
              </Field>
            </div>
            <div style={{ width: 220 }}>
              <Field label={got(i.id) < i.pending ? 'Motivo de la diferencia' : 'Nota (opcional)'}>
                <Input value={notes[i.id] ?? ''} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} aria-label={`Nota de ${i.name}`} />
              </Field>
            </div>
          </div>
        ))}
        <Field label="Comentarios de la recepción">
          <Input value={general} onChange={(e) => setGeneral(e.target.value)} placeholder="Factura, remisión, condiciones del embarque…" />
        </Field>
        {short.length > 0 && (
          <label className="row gap8 small">
            <input type="checkbox" checked={closeShort} onChange={(e) => setCloseShort(e.target.checked)} />
            Cerrar la orden con faltante (el proveedor no entregará el resto)
          </label>
        )}
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
      </div>
    </Modal>
  );
}
