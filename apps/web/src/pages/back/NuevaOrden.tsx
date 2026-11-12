import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import type { OrderDetail, PurchaseOptions } from '../../lib/compras-types';
import { mxn, r2 } from '../../lib/format';
import { Button, Field, Icon, Input, Notice, Select, TextArea } from '../../ui/kit';

interface Line {
  key: number;
  productId: number | null;
  quantity: string;
  unitCost: string;
}

let keySeq = 0;
const blankLine = (): Line => ({ key: ++keySeq, productId: null, quantity: '', unitCost: '' });

/** Formulario de orden de compra. Puede llegar precargado desde las sugerencias (location.state). */
export function NuevaOrden() {
  const nav = useNavigate();
  const preset = (useLocation().state ?? null) as { supplierId?: number; items?: { productId: number; quantity: number; unitCost: number }[] } | null;
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(preset?.supplierId ?? null);
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>(() =>
    preset?.items?.length
      ? preset.items.map((i) => ({ key: ++keySeq, productId: i.productId, quantity: String(i.quantity), unitCost: String(i.unitCost) }))
      : [blankLine()],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PurchaseOptions>('GET', '/purchasing/options')
      .then(setOptions)
      .catch((e) => setError(errMsg(e)));
  }, []);

  const supplier = options?.suppliers.find((s) => s.id === supplierId);
  const products = options?.products ?? [];
  const total = useMemo(() => r2(lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0)), [lines]);
  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  function pick(key: number, id: string) {
    const prod = products.find((p) => p.id === Number(id));
    patch(key, { productId: prod?.id ?? null, unitCost: prod ? String(prod.purchasePrice) : '' });
  }

  async function save() {
    if (!supplierId) return setError('Elige un proveedor');
    const items = lines.filter((l) => l.productId !== null);
    if (!items.length) return setError('Agrega al menos un producto');
    if (new Set(items.map((l) => l.productId)).size !== items.length) return setError('Un producto está repetido; junta las cantidades en un solo renglón');
    if (items.some((l) => !(Number(l.quantity) > 0))) return setError('Todas las cantidades deben ser mayores a 0');
    if (items.some((l) => l.unitCost === '' || Number(l.unitCost) < 0)) return setError('Indica el precio acordado de cada producto');
    setBusy(true);
    try {
      const o = await api<OrderDetail>('POST', '/purchasing/orders', {
        supplierId,
        expectedAt: expectedAt || undefined,
        notes: notes.trim() || undefined,
        items: items.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
      });
      nav('/compras', { state: { selectId: o.id } });
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Nueva orden de compra</h1>
          <div className="small muted">Se guarda como borrador; envíala al proveedor cuando esté lista.</div>
        </div>
        <Link to="/compras" className="btn secondary">
          Cancelar
        </Link>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      <div className="split">
        <div className="grow" style={{ flex: 1 }}>
          <div className="card">
            <div className="card-b">
              <div className="row gap12">
                <div className="grow">
                  <Field label="Proveedor">
                    <Select value={supplierId ?? ''} onChange={(v) => setSupplierId(v ? Number(v) : null)}>
                      <option value="">Elige un proveedor…</option>
                      {(options?.suppliers ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div style={{ width: 200 }}>
                  <Field label="Entrega esperada">
                    <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
                  </Field>
                </div>
              </div>
              {supplier && (
                <div className="caption muted">
                  {supplier.paymentDays === 0 ? 'Pago de contado' : `Crédito a ${supplier.paymentDays} días`}
                  {supplier.lines.length ? ` · Surte ${supplier.lines.map((l) => l.name).join(', ')}` : ''}
                </div>
              )}
            </div>
          </div>

          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ width: 110 }} className="right">
                    Existencia
                  </th>
                  <th style={{ width: 130 }}>Cantidad (kg)</th>
                  <th style={{ width: 130 }}>Precio por kg</th>
                  <th style={{ width: 110 }} className="right">
                    Importe
                  </th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const prod = products.find((p) => p.id === l.productId);
                  return (
                    <tr key={l.key}>
                      <td>
                        <Select value={l.productId ?? ''} onChange={(v) => pick(l.key, v)}>
                          <option value="">Elige un producto…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} · {p.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="right muted">{prod ? `${prod.stock.toLocaleString('es-MX')} / mín. ${prod.minStock}` : '—'}</td>
                      <td>
                        <Input
                          inputMode="decimal"
                          value={l.quantity}
                          onChange={(e) => patch(l.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })}
                          aria-label="Cantidad"
                        />
                      </td>
                      <td>
                        <Input
                          prefix="$"
                          inputMode="decimal"
                          value={l.unitCost}
                          onChange={(e) => patch(l.key, { unitCost: e.target.value.replace(/[^\d.]/g, '') })}
                          aria-label="Precio por kg"
                        />
                      </td>
                      <td className="right strong">{mxn((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-label="Quitar renglón"
                          onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}
                        >
                          <Icon name="trash" size={16} color="var(--text-3)" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <Button icon="plus" onClick={() => setLines((ls) => [...ls, blankLine()])}>
              Agregar producto
            </Button>
          </div>
        </div>

        <aside className="card" style={{ width: 320, flex: 'none' }}>
          <div className="card-h">
            <span className="title">Resumen</span>
          </div>
          <div className="card-b">
            <Field label="Notas para el proveedor">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </Field>
            <div className="kv">
              <span className="title">Total</span>
              <span className="num">{mxn(total)}</span>
            </div>
            <Button variant="primary" size="lg" icon="check" disabled={busy || !options} onClick={save}>
              Guardar orden
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}
