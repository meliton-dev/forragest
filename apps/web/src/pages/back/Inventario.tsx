import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { diaCorto, hhmm, mxn } from '../../lib/format';
import { filterStock, MOVEMENT_LABEL, stockState, type Movement, type StockRow } from '../../lib/inventory';
import { Badge, Button, Empty, Field, Input, Modal, Notice, Segmented } from '../../ui/kit';

const qty = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });
const STATE = { agotado: ['danger', 'Agotado'], bajo: ['warn', 'Bajo mínimo'], bien: ['ok', 'Suficiente'] } as const;
type Dialog = { kind: 'entry' | 'adjust' | 'moves'; product: StockRow };

export function Inventario() {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [line, setLine] = useState('');
  const [onlyLow, setOnlyLow] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<StockRow[]>('GET', '/inventory'));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const all = rows ?? [];
  const shown = filterStock(all, { query, line, onlyLow: onlyLow === 'bajo' });
  const lines = [...new Map(all.map((r) => [r.line, r.lineName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const count = (s: keyof typeof STATE) => all.filter((r) => stockState(r) === s).length;
  const saved = (msg: string) => {
    setDialog(null);
    setDone(msg);
    void load();
  };

  return (
    <>
      <div>
        <h1 className="h1">Inventario</h1>
        <div className="small muted">Existencias del almacén. Las ventas, las rutas y las compras las actualizan solas.</div>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      {done && (
        <Notice tone="ok" icon="check">
          {done}
        </Notice>
      )}
      <div className="kpis">
        <div className="card kpi">
          <span className="overline">Productos</span>
          <span className="num-lg">{all.length}</span>
          <span className="caption muted">activos en el catálogo</span>
        </div>
        <div className="card kpi">
          <span className="overline">Bajo mínimo</span>
          <span className="num-lg">{count('bajo')}</span>
          <span className="caption muted">conviene reabastecer</span>
        </div>
        <div className="card kpi">
          <span className="overline">Agotados</span>
          <span className="num-lg">{count('agotado')}</span>
          <span className="caption muted">sin existencia</span>
        </div>
        <div className="card kpi">
          <span className="overline">Valor del inventario</span>
          <span className="num-lg">{mxn(all.reduce((a, r) => a + r.value, 0))}</span>
          <span className="caption muted">al costo de compra</span>
        </div>
      </div>
      <div className="row between gap12" style={{ flexWrap: 'wrap' }}>
        <div className="row gap8" style={{ flexWrap: 'wrap' }}>
          <Segmented value={line} onChange={setLine} options={[['', 'Todas'], ...lines.map(([code, name]) => [code, name] as [string, string])]} />
          <Segmented
            value={onlyLow}
            onChange={setOnlyLow}
            options={[
              ['', 'Todo'],
              ['bajo', 'Por reabastecer'],
            ]}
          />
        </div>
        <div style={{ flex: '1 1 220px', maxWidth: 320 }}>
          <Input icon="search" placeholder="Buscar por código o nombre" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar producto" />
        </div>
      </div>
      <div className="tw">
        <table className="t" style={{ minWidth: 960 }}>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Código</th>
              <th>Producto</th>
              <th className="right" style={{ width: 120 }}>
                Existencia
              </th>
              <th className="right" style={{ width: 100 }}>
                Mínimo
              </th>
              <th className="right" style={{ width: 120 }}>
                Valor
              </th>
              <th style={{ width: 130 }}>Estado</th>
              <th style={{ width: 300 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const [tone, label] = STATE[stockState(r)];
              return (
                <tr key={r.id}>
                  <td className="muted">{r.code}</td>
                  <td className="strong">
                    {r.name}
                    <div className="caption muted">{r.lineName}</div>
                  </td>
                  <td className="right strong">
                    {qty(r.stock)} {r.unit}
                  </td>
                  <td className="right muted">{qty(r.minStock)}</td>
                  <td className="right">{mxn(r.value)}</td>
                  <td>
                    <Badge tone={tone} dot>
                      {label}
                    </Badge>
                  </td>
                  <td>
                    <div className="user-actions">
                      <Button size="sm" icon="plus" onClick={() => setDialog({ kind: 'entry', product: r })}>
                        Entrada
                      </Button>
                      <Button size="sm" onClick={() => setDialog({ kind: 'adjust', product: r })}>
                        Ajustar
                      </Button>
                      <Button size="sm" onClick={() => setDialog({ kind: 'moves', product: r })}>
                        Movimientos
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows && !error && (
          <div className="small muted" style={{ padding: 16 }}>
            Cargando…
          </div>
        )}
        {rows && shown.length === 0 && (
          <Empty icon="box" title="Sin productos">
            Ninguno coincide con el filtro.
          </Empty>
        )}
      </div>
      {dialog?.kind === 'entry' && <Entry product={dialog.product} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === 'adjust' && <Adjust product={dialog.product} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === 'moves' && <Moves product={dialog.product} onClose={() => setDialog(null)} />}
    </>
  );
}

interface FormProps {
  product: StockRow;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

/** Diálogo con un formulario que guarda: botones, estado de envío y error. */
function FormModal({
  title,
  product,
  ready,
  onClose,
  save,
  children,
}: {
  title: string;
  product: StockRow;
  ready: boolean;
  onClose: () => void;
  save: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      await save();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      sub={`${product.code} · ${product.name} · hay ${qty(product.stock)} ${product.unit}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={!ready || busy} onClick={run}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="col gap12">
        {children}
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
      </div>
    </Modal>
  );
}

const decimal = (v: string) => v.replace(/[^\d.]/g, '');

function Entry({ product, onClose, onSaved }: FormProps) {
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState(String(product.purchasePrice));
  const [expires, setExpires] = useState('');
  const [reason, setReason] = useState('');
  return (
    <FormModal
      title="Entrada de mercancía"
      product={product}
      ready={Number(amount) > 0 && cost !== '' && Number(cost) >= 0 && !!reason.trim()}
      onClose={onClose}
      save={async () => {
        await api('POST', '/inventory/entries', {
          productId: product.id,
          quantity: Number(amount),
          unitCost: Number(cost),
          expiresAt: expires || undefined,
          reason: reason.trim(),
        });
        onSaved(`Entraron ${qty(Number(amount))} ${product.unit} de ${product.name}.`);
      }}
    >
      <Notice tone="neutral">Lo que llega por una orden de compra se registra al recibirla en Compras, no aquí.</Notice>
      <Field label={`Cantidad (${product.unit})`}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(decimal(e.target.value))} autoFocus aria-label="Cantidad" />
      </Field>
      <Field label={`Costo por ${product.unit}`}>
        <Input prefix="$" inputMode="decimal" value={cost} onChange={(e) => setCost(decimal(e.target.value))} aria-label="Costo" />
      </Field>
      <Field label="Caducidad (opcional)">
        <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Caducidad" />
      </Field>
      <Field label="Motivo">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} aria-label="Motivo" />
      </Field>
    </FormModal>
  );
}

function Adjust({ product, onClose, onSaved }: FormProps) {
  const [real, setReal] = useState('');
  const [reason, setReason] = useState('');
  const delta = Math.round((Number(real) - product.stock) * 1000) / 1000;
  return (
    <FormModal
      title="Ajustar existencia"
      product={product}
      ready={real !== '' && delta !== 0 && !Number.isNaN(delta) && !!reason.trim()}
      onClose={onClose}
      save={async () => {
        await api('POST', '/inventory/adjustments', { productId: product.id, delta, reason: reason.trim() });
        onSaved(`${product.name} quedó en ${qty(Number(real))} ${product.unit}.`);
      }}
    >
      <Field label={`Existencia real contada (${product.unit})`}>
        <Input inputMode="decimal" value={real} onChange={(e) => setReal(decimal(e.target.value))} autoFocus aria-label="Existencia real" />
      </Field>
      {real !== '' && delta !== 0 && !Number.isNaN(delta) && (
        <Notice tone="warn" icon="alert">
          Se {delta > 0 ? 'sumarán' : 'restarán'} {qty(Math.abs(delta))} {product.unit}.
        </Notice>
      )}
      <Field label="Motivo del ajuste">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej. merma, conteo físico" aria-label="Motivo" />
      </Field>
    </FormModal>
  );
}

function Moves({ product, onClose }: { product: StockRow; onClose: () => void }) {
  const [moves, setMoves] = useState<Movement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Movement[]>('GET', `/inventory/movements?productId=${product.id}`)
      .then(setMoves)
      .catch((e) => setError(errMsg(e)));
  }, [product.id]);
  return (
    <Modal wide title="Movimientos" sub={`${product.code} · ${product.name}`} onClose={onClose} footer={<Button onClick={onClose}>Cerrar</Button>}>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      {!moves && !error && <div className="small muted">Cargando…</div>}
      {moves && moves.length === 0 && <Empty icon="box" title="Sin movimientos" />}
      {moves && moves.length > 0 && (
        <div className="tw" style={{ flex: 'none' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th className="right">Cantidad</th>
                <th>Quién · motivo</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {diaCorto(m.createdAt)} {hhmm(m.createdAt)}
                  </td>
                  <td>{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                  <td className="right strong" style={{ color: m.quantity > 0 ? 'var(--ok)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                    {m.quantity > 0 ? '+' : '−'}
                    {qty(Math.abs(m.quantity))}
                  </td>
                  <td className="muted">{[m.user, m.reason].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
