import { useEffect, useRef, useState } from 'react';
import { isBulk, parseQty, type CartLine as Line } from '../lib/cart';
import { mxn } from '../lib/format';
import { Icon } from './kit';

/** Cantidad que se puede teclear (con + y − para ajustar de uno en uno). No pasa de la existencia. */
function QtyField({ line, onQty }: { line: Line; onQty: (qty: number) => void }) {
  const { item, qty } = line;
  const decimal = isBulk(item);
  const [text, setText] = useState(String(qty));
  const [note, setNote] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // si la cantidad cambia desde fuera (+, −, tocar el producto en el catálogo), el campo la refleja;
  // mientras se teclea "2." el valor sigue siendo 2 y no se pisa lo escrito
  useEffect(() => {
    if (parseFloat(text) !== qty) setText(String(qty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty]);

  function change(raw: string) {
    const clean = raw.replace(/[^\d.,]/g, '');
    setText(clean);
    const p = parseQty(clean, item.stockUnits, decimal);
    setNote(p.clamped);
    if (p.clamped) setText(String(p.qty));
    if (p.qty !== null) onQty(p.qty);
  }

  return (
    <div className="stepper">
      <button aria-label={`Quitar uno de ${item.name}`} onClick={() => onQty(qty - 1)}>
        <Icon name="minus" size={16} color="var(--text-2)" />
      </button>
      <input
        ref={input}
        value={text}
        inputMode={decimal ? 'decimal' : 'numeric'}
        aria-label={`Cantidad de ${item.name}`}
        title={note ? `Máximo disponible: ${item.stockUnits}` : undefined}
        className={note ? 'max' : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          setText(String(qty)); // vacío o inválido: vuelve a la cantidad vigente
          setNote(false);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <button aria-label={`Agregar uno de ${item.name}`} disabled={qty >= item.stockUnits} onClick={() => onQty(qty + 1)}>
        <Icon name="plus" size={16} color="var(--text-2)" />
      </button>
    </div>
  );
}

/** Una partida del ticket: nombre, precio, cantidad editable, importe y botón para quitar el producto completo. */
export function CartLine({ line, onQty, onRemove }: { line: Line; onQty: (qty: number) => void; onRemove: () => void }) {
  const { item, qty } = line;
  return (
    <div className="cart-line" data-testid="cart-line">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="small strong">{item.name}</div>
          <div className="caption muted">
            {item.presentation} · {mxn(item.price)}
            {qty >= item.stockUnits && <span style={{ color: 'var(--warn)' }}> · máximo disponible</span>}
          </div>
        </div>
        <button className="icon-btn line-del" aria-label={`Quitar ${item.name} del ticket`} title="Quitar del ticket" onClick={onRemove}>
          <Icon name="trash" size={17} color="var(--danger)" />
        </button>
      </div>
      <div className="row between">
        <QtyField line={line} onQty={onQty} />
        <span className="num line-total">{mxn(qty * item.price)}</span>
      </div>
    </div>
  );
}
