import { useState } from 'react';
import { api, errMsg } from '../lib/api';
import { folio, mxn, PAY_LABEL, r2 } from '../lib/format';
import type { CreditNote, Sale } from '../lib/types';
import { usePos } from '../pos-context';
import { Badge, Button, Field, Icon, Kv, Notice, Segmented, Select, TextArea } from '../ui/kit';
import { NoteReceipt, ReceiptModal } from '../ui/Receipt';

const REASONS = ['Producto en mal estado', 'Error en el pedido', 'El cliente ya no lo necesita', 'Producto equivocado', 'Otro'];
type Refund = 'EFECTIVO' | 'TARJETA' | 'SALDO_A_FAVOR';

export function Devoluciones() {
  const pos = usePos();
  const [input, setInput] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [comments, setComments] = useState('');
  const [refund, setRefund] = useState<Refund>('EFECTIVO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<CreditNote | null>(null);

  async function search() {
    setError(null);
    setSale(null);
    setQty({});
    try {
      const s = await api<Sale>('GET', `/pos/sales/by-folio/${Number(input)}`);
      setSale(s);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const net = sale && sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
  const total = sale ? r2(sale.items.reduce((a, i) => a + (qty[i.id] ?? 0) * i.unitPrice * net, 0)) : 0;
  const onCredit = sale?.paymentMethod === 'CREDITO';
  const blocked = !sale || sale.status === 'CANCELADA';

  async function submit() {
    if (!sale) return;
    setBusy(true);
    setError(null);
    try {
      const n = await api<CreditNote>('POST', '/pos/returns', {
        saleId: sale.id,
        items: sale.items.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ saleItemId: i.id, quantity: qty[i.id] })),
        reason,
        comments: comments.trim() || undefined,
        refundMethod: onCredit ? undefined : refund,
      });
      setNote(n);
      pos.bumpCatalog();
      void pos.reloadShift();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="grow">
        <div className="row">
          <div className="input grow" style={{ height: 48 }}>
            <Icon name="search" size={18} color="var(--text-3)" />
            <input placeholder="Folio de la venta (ej. 000124)" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && input && void search()} aria-label="Folio de la venta" />
          </div>
          <Button variant="primary" disabled={!input} onClick={search} style={{ height: 48 }}>Buscar venta</Button>
        </div>
        {error && <Notice tone="danger" icon="alert">{error}</Notice>}
        {!sale && !error && (
          <div className="card"><div className="empty"><Icon name="undo" size={32} color="var(--border-strong)" /><div className="title muted2">Busca la venta a devolver</div><div className="small">Captura el folio impreso en el ticket del cliente.</div></div></div>
        )}
        {sale && (
          <div className="card">
            <div className="card-h">
              <span className="title">Venta {folio(sale.folio)}</span>
              <span className="caption muted">{new Date(sale.createdAt).toLocaleString('es-MX')}</span>
            </div>
            <div className="row" style={{ padding: '12px 16px', gap: 28, borderBottom: '1px solid var(--border)' }}>
              {[['Cliente', sale.customer?.name ?? 'Público general'], ['Pago', PAY_LABEL[sale.paymentMethod]], ['Cajero', sale.cashier], ['Total', mxn(sale.total)]].map(([k, v]) => (
                <div key={k}><div className="caption muted">{k}</div><div className="small strong">{v}</div></div>
              ))}
              {sale.status === 'CANCELADA' && <Badge tone="danger">Cancelada</Badge>}
            </div>
            <table className="t">
              <thead><tr><th>Producto</th><th className="right" style={{ width: 80 }}>Vendido</th><th className="right" style={{ width: 90 }}>Devuelto</th><th style={{ width: 150 }} className="right">Devolver</th><th className="right" style={{ width: 100 }}>Importe</th></tr></thead>
              <tbody>
                {sale.items.map((i) => {
                  const left = i.quantity - i.returnedQty;
                  const q = qty[i.id] ?? 0;
                  return (
                    <tr key={i.id}>
                      <td><div className="strong">{i.name}</div><div className="caption muted">{i.presentation} · {mxn(i.unitPrice)}</div></td>
                      <td className="right">{i.quantity}</td>
                      <td className="right muted">{i.returnedQty}</td>
                      <td className="right">
                        <span className="stepper" style={{ display: 'inline-flex' }}>
                          <button aria-label={`Quitar ${i.name}`} disabled={q <= 0 || blocked} onClick={() => setQty({ ...qty, [i.id]: q - 1 })}><Icon name="minus" size={15} color="var(--text-2)" /></button>
                          <span>{q}</span>
                          <button aria-label={`Devolver ${i.name}`} disabled={q >= left || blocked} onClick={() => setQty({ ...qty, [i.id]: q + 1 })}><Icon name="plus" size={15} color="var(--text-2)" /></button>
                        </span>
                      </td>
                      <td className="right strong">{q ? mxn(r2(q * i.unitPrice * net)) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sale && (
          <div className="card">
            <div className="card-h"><span className="title">Motivo de la devolución</span></div>
            <div className="card-b">
              <div className="row gap16" style={{ alignItems: 'flex-start' }}>
                <div className="grow"><Field label="Motivo"><Select value={reason} onChange={setReason}>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field></div>
                <div className="grow"><Field label="Comentarios"><TextArea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Opcional" maxLength={300} /></Field></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="card" style={{ width: 360, flex: 'none' }}>
        <div className="card-h"><span className="title">Nota de crédito</span></div>
        <div className="card-b">
          <Kv k="Subtotal devuelto" v={mxn(total)} />
          {sale && sale.discountAmount > 0 && <Kv k="Incluye prorrateo del descuento" v={`${(net * 100).toFixed(1)} %`} />}
          <hr className="divider" />
          <Kv k="Total a devolver" v={mxn(total)} big />
          {onCredit ? (
            <Notice tone="info">Es una venta a crédito: la devolución se aplica al saldo del cliente.</Notice>
          ) : (
            <>
              <span className="overline">Forma de reembolso</span>
              <Segmented soft value={refund} onChange={setRefund} options={[['EFECTIVO', 'Efectivo'], ['TARJETA', 'A tarjeta'], ['SALDO_A_FAVOR', 'Saldo']]} />
            </>
          )}
          <Notice tone="info">El producto regresa al inventario como entrada de devolución y se genera un folio de nota de crédito.</Notice>
          <Button variant="primary" size="lg" icon="printer" disabled={busy || total <= 0 || blocked} onClick={submit}>
            {busy ? 'Generando…' : 'Generar e imprimir nota de crédito'}
          </Button>
        </div>
      </aside>

      {note && (
        <ReceiptModal
          title={`Nota de crédito NC-${folio(note.folio)}`}
          sub={`${mxn(note.total)} · venta ${folio(note.saleFolio)}`}
          extra={<span />}
          onClose={() => {
            setNote(null);
            setSale(null);
            setInput('');
            setQty({});
            setComments('');
          }}
          render={(mm) => <NoteReceipt note={note} mm={mm} />}
        />
      )}
    </div>
  );
}
