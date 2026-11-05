import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import type { Suggestion } from '../../lib/compras-types';
import { mxn } from '../../lib/format';
import { Button, Empty, Input, Notice } from '../../ui/kit';

const kg = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });

/** COM-005: productos en o bajo su mínimo, con la cantidad que haría falta pedir. */
export function Sugerencias() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Suggestion[]>('GET', '/purchasing/suggestions')
      .then((r) => {
        setRows(r);
        setQty(Object.fromEntries(r.map((s) => [s.productId, String(s.quantity)])));
        setPicked(new Set(r.filter((s) => s.supplier).map((s) => s.productId)));
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  // una orden por proveedor: se arma con lo marcado que comparte el proveedor del primer marcado
  const chosen = useMemo(() => (rows ?? []).filter((s) => picked.has(s.productId)), [rows, picked]);
  const supplierId = chosen.find((s) => s.supplier)?.supplier?.id ?? null;
  const forOrder = chosen.filter((s) => !s.supplier || s.supplier.id === supplierId);
  const skipped = chosen.length - forOrder.length;

  function create() {
    const items = forOrder.filter((s) => Number(qty[s.productId]) > 0).map((s) => ({ productId: s.productId, quantity: Number(qty[s.productId]), unitCost: s.unitCost }));
    if (!items.length) return setError('Marca al menos un producto con cantidad mayor a 0');
    nav('/compras/nueva', { state: { supplierId: supplierId ?? undefined, items } });
  }

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Sugerencias de compra</h1>
          <div className="small muted">Productos en o bajo su mínimo. Se sugiere reponer hasta el doble del mínimo, descontando lo que ya viene en camino.</div>
        </div>
        <Link to="/compras" className="btn secondary">Volver a órdenes</Link>
      </div>
      {error && <Notice tone="danger" icon="alert">{error}</Notice>}
      <div className="tw">
        <table className="t">
          <thead>
            <tr><th style={{ width: 40 }} /><th>Producto</th><th className="right" style={{ width: 100 }}>Existencia</th><th className="right" style={{ width: 90 }}>Mínimo</th><th className="right" style={{ width: 100 }}>En camino</th><th style={{ width: 130 }}>Pedir (kg)</th><th>Proveedor sugerido</th><th className="right" style={{ width: 100 }}>Último precio</th></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((s) => (
              <tr key={s.productId}>
                <td><input type="checkbox" aria-label={`Incluir ${s.name}`} checked={picked.has(s.productId)} onChange={(e) => setPicked((p) => { const n = new Set(p); e.target.checked ? n.add(s.productId) : n.delete(s.productId); return n; })} /></td>
                <td className="strong">{s.name}<div className="caption muted">{s.code}</div></td>
                <td className="right" style={{ color: s.stock <= 0 ? 'var(--danger)' : 'var(--warn)' }}>{kg(s.stock)}</td>
                <td className="right muted">{kg(s.minStock)}</td>
                <td className="right muted">{s.onOrder ? kg(s.onOrder) : '—'}</td>
                <td><Input inputMode="decimal" value={qty[s.productId] ?? ''} onChange={(e) => setQty({ ...qty, [s.productId]: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`Cantidad de ${s.name}`} /></td>
                <td>{s.supplier?.name ?? <span className="muted">Sin proveedor asignado</span>}</td>
                <td className="right">{mxn(s.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <Empty icon="check" title="Todo al corriente">Ningún producto está en o bajo su mínimo.</Empty>}
      </div>
      {skipped > 0 && <Notice tone="info">Una orden es de un solo proveedor: {skipped} producto{skipped === 1 ? '' : 's'} de otro proveedor quedará{skipped === 1 ? '' : 'n'} para una segunda orden.</Notice>}
      {rows && rows.length > 0 && <div><Button variant="primary" icon="plus" onClick={create}>Crear orden con lo marcado</Button></div>}    </>
  );
}
