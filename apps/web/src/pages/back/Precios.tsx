import { useEffect, useMemo, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import type { PriceHistory, PurchaseOptions } from '../../lib/compras-types';
import { mxn } from '../../lib/format';
import { Badge, Empty, Notice, Select } from '../../ui/kit';

const day = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

/** COM-004: historial de compras por proveedor y comparativa de precios. */
export function Precios() {
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [data, setData] = useState<PriceHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PurchaseOptions>('GET', '/purchasing/options')
      .then(setOptions)
      .catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(() => {
    const q = new URLSearchParams();
    if (productId) q.set('productId', productId);
    if (supplierId) q.set('supplierId', supplierId);
    api<PriceHistory>('GET', `/purchasing/price-history?${q}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errMsg(e)));
  }, [productId, supplierId]);

  // el proveedor más barato (último precio) de cada producto se marca como referencia
  const cheapest = useMemo(() => {
    const best = new Map<number, number>();
    for (const c of data?.comparison ?? []) best.set(c.productId, Math.min(best.get(c.productId) ?? Infinity, c.last));
    return best;
  }, [data]);

  return (
    <>
      <div>
        <h1 className="h1">Historial y precios</h1>
        <div className="small muted">Lo comprado a cada proveedor y cómo se comparan sus precios. Solo cuenta lo enviado al proveedor.</div>
      </div>
      <div className="row gap12">
        <div style={{ width: 280 }}>
          <Select value={productId} onChange={setProductId}>
            <option value="">Todos los productos</option>
            {(options?.products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ width: 280 }}>
          <Select value={supplierId} onChange={setSupplierId}>
            <option value="">Todos los proveedores</option>
            {(options?.suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}

      <span className="overline">Comparativa por producto y proveedor</span>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Proveedor</th>
              <th className="right" style={{ width: 90 }}>
                Compras
              </th>
              <th className="right" style={{ width: 100 }}>
                Último
              </th>
              <th className="right" style={{ width: 100 }}>
                Mínimo
              </th>
              <th className="right" style={{ width: 100 }}>
                Máximo
              </th>
              <th className="right" style={{ width: 110 }}>
                Promedio
              </th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {(data?.comparison ?? []).map((c) => (
              <tr key={`${c.productId}:${c.supplierId}`}>
                <td className="strong">
                  {c.product}
                  <div className="caption muted">{c.code}</div>
                </td>
                <td>{c.supplier}</td>
                <td className="right muted">{c.purchases}</td>
                <td className="right strong">{mxn(c.last)}</td>
                <td className="right">{mxn(c.min)}</td>
                <td className="right">{mxn(c.max)}</td>
                <td className="right">{mxn(c.average)}</td>
                <td>
                  {c.last === cheapest.get(c.productId) && (data?.comparison ?? []).filter((x) => x.productId === c.productId).length > 1 && (
                    <Badge tone="ok">Más barato</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.comparison.length === 0 && (
          <Empty icon="chart" title="Sin compras registradas">
            Aparecerán cuando envíes órdenes a tus proveedores.
          </Empty>
        )}
      </div>

      <span className="overline">Compras</span>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Fecha</th>
              <th style={{ width: 100 }}>Orden</th>
              <th>Proveedor</th>
              <th>Producto</th>
              <th className="right" style={{ width: 110 }}>
                Cantidad
              </th>
              <th className="right" style={{ width: 100 }}>
                Precio
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).slice(0, 200).map((r, i) => (
              <tr key={i}>
                <td className="muted">{day(r.date)}</td>
                <td>{r.folio}</td>
                <td>{r.supplier}</td>
                <td>{r.product}</td>
                <td className="right">{r.quantity.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                <td className="right strong">{mxn(r.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
