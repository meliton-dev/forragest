import { useState, type ReactNode } from 'react';
import { fecha, folio, hhmm, mxn, PAY_LABEL, REFUND_LABEL } from '../lib/format';
import type { CreditNote, Sale } from '../lib/types';
import { Button, Modal, Segmented } from './kit';

type Mm = 'mm80' | 'mm58';

function Bars({ seed }: { seed: number }) {
  const digits = String(seed).padStart(6, '0').split('').map(Number);
  const widths = [2, 1, 3, 1, 2, ...digits.map((d) => (d % 3) + 1), 1, 2, 1, 3, 2, 1];
  return (
    <div className="bars" aria-hidden>
      {widths.map((w, i) => (
        <i key={i} style={{ width: w }} />
      ))}
    </div>
  );
}

function Header({ store }: { store: Sale['store'] }) {
  return (
    <>
      <div className="c b" style={{ fontSize: 14 }}>
        {store.name.toUpperCase()}
      </div>
      <div className="c m">{store.address}</div>
      <div className="c m">
        RFC {store.rfc} · Tel. {store.phone}
      </div>
      <div className="sep" />
    </>
  );
}

export function SaleReceipt({ sale, mm }: { sale: Sale; mm: Mm }) {
  const when = new Date(sale.createdAt).toISOString();
  return (
    <div className={`receipt ${mm}`} data-testid="receipt">
      <Header store={sale.store} />
      <div className="r">
        <span>Folio {folio(sale.folio)}</span>
        <span>{sale.register}</span>
      </div>
      <div className="r">
        <span>{fecha(when)}</span>
        <span>{hhmm(when)}</span>
      </div>
      {mm === 'mm80' && <div className="m">Cajero: {sale.cashier}</div>}
      {sale.customer && <div className="m">Cliente: {sale.customer.name}</div>}
      {sale.status === 'CANCELADA' && <div className="c b">*** VENTA CANCELADA ***</div>}
      <div className="sep" />
      {sale.items.map((i) => (
        <div key={i.id}>
          <div>
            {i.quantity} × {i.name} {i.presentation}
          </div>
          <div className="r m">
            <span>&nbsp;&nbsp;{mxn(i.unitPrice)} c/u</span>
            <span>{mxn(i.total)}</span>
          </div>
        </div>
      ))}
      <div className="sep" />
      <div className="r">
        <span>Subtotal</span>
        <span>{mxn(sale.subtotal)}</span>
      </div>
      <div className="r">
        <span>Descuento</span>
        <span>{mxn(sale.discountAmount)}</span>
      </div>
      <div className="r total">
        <span>TOTAL</span>
        <span>{mxn(sale.total)}</span>
      </div>
      <div className="sep" />
      <div className="r">
        <span>Forma de pago</span>
        <span>{PAY_LABEL[sale.paymentMethod]}</span>
      </div>
      {sale.paymentMethod === 'EFECTIVO' && sale.received !== null && (
        <>
          <div className="r">
            <span>Efectivo recibido</span>
            <span>{mxn(sale.received)}</span>
          </div>
          <div className="r">
            <span>Cambio</span>
            <span>{mxn(sale.change ?? 0)}</span>
          </div>
        </>
      )}
      {sale.paymentMethod === 'CREDITO' && (
        <>
          <div className="r">
            <span>Saldo a crédito</span>
            <span>{mxn(sale.balance)}</span>
          </div>
          {sale.dueDate && (
            <div className="r">
              <span>Vence</span>
              <span>{fecha(sale.dueDate)}</span>
            </div>
          )}
        </>
      )}
      <div className="sep" />
      <div className="c b">¡Gracias por su compra!</div>
      <div className="c m">Conserve su ticket para aclaraciones.</div>
      <Bars seed={sale.folio} />
      <div className="c m">{folio(sale.folio)}</div>
    </div>
  );
}

export function NoteReceipt({ note, mm }: { note: CreditNote; mm: Mm }) {
  return (
    <div className={`receipt ${mm}`} data-testid="receipt">
      <Header store={note.store} />
      <div className="c b">NOTA DE CRÉDITO</div>
      <div className="r">
        <span>Folio NC-{folio(note.folio)}</span>
        <span>Venta {folio(note.saleFolio)}</span>
      </div>
      <div className="r">
        <span>{fecha(note.createdAt)}</span>
        <span>{hhmm(note.createdAt)}</span>
      </div>
      <div className="sep" />
      {note.items.map((i, k) => (
        <div key={k}>
          <div>
            {i.quantity} × {i.name} {i.presentation}
          </div>
          <div className="r m">
            <span>&nbsp;</span>
            <span>{mxn(i.amount)}</span>
          </div>
        </div>
      ))}
      <div className="sep" />
      <div className="r total">
        <span>TOTAL DEVUELTO</span>
        <span>{mxn(note.total)}</span>
      </div>
      <div className="r">
        <span>Reembolso</span>
        <span>{REFUND_LABEL[note.refundMethod] ?? note.refundMethod}</span>
      </div>
      <div className="m">Motivo: {note.reason}</div>
      <div className="sep" />
      <div className="c m">Documento no fiscal. Conserve para aclaraciones.</div>
      <Bars seed={note.folio} />
    </div>
  );
}

/** Vista previa del ticket con elección de papel (58 / 80 mm) e impresión. */
export function ReceiptModal({
  title,
  sub,
  onClose,
  render,
  extra,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  render: (mm: Mm) => ReactNode;
  extra?: ReactNode;
}) {
  const [mm, setMm] = useState<Mm>('mm80');
  return (
    <Modal
      title={title}
      sub={sub}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{extra ? 'Cerrar' : 'Nueva venta'}</Button>
          <Button variant="primary" icon="printer" onClick={() => window.print()}>
            Imprimir ticket
          </Button>
        </>
      }
    >
      <Segmented
        soft
        value={mm}
        onChange={setMm}
        options={[
          ['mm80', 'Papel de 80 mm'],
          ['mm58', 'Papel de 58 mm'],
        ]}
      />
      <div className="receipt-wrap print-area">{render(mm)}</div>
      {extra}
    </Modal>
  );
}
