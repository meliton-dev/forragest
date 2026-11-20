import { useEffect, useRef, useState } from 'react';
import { api, errMsg, uid } from '../lib/api';
import { quickAmounts, totalsOf } from '../lib/cart';
import { folio, mxn } from '../lib/format';
import type { CatalogItem, CreditInfo, PayMethod, Sale } from '../lib/types';
import { usePos } from '../pos-context';
import { CartLine } from '../ui/CartLine';
import { Badge, Button, Empty, Field, Icon, Input, Modal, Notice, Segmented, Species } from '../ui/kit';
import { ReceiptModal, SaleReceipt } from '../ui/Receipt';

const LINES: [string, string][] = [
  ['', 'Todas'],
  ['OVINO', 'Ovino'],
  ['BOVINO', 'Bovino'],
  ['AVES', 'Aves'],
];
const METHODS: [PayMethod, string, string][] = [
  ['EFECTIVO', 'Efectivo', 'cash'],
  ['TRANSFERENCIA', 'Transfer.', 'transfer'],
  ['TARJETA', 'Tarjeta', 'card'],
  ['CREDITO', 'Crédito', 'clock'],
];

export function Venta() {
  const pos = usePos();
  const { cart, setCart } = pos;
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState('');
  const [line, setLine] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'customer' | 'discount'>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const opId = useRef(uid());
  const listRef = useRef<HTMLDivElement>(null);
  const lineCount = cart.lines.length;
  const prevCount = useRef(lineCount);
  useEffect(() => {
    // al agregar un producto nuevo el ticket baja hasta él, para que siempre se vea lo que se acaba de agregar
    if (lineCount > prevCount.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    prevCount.current = lineCount;
  }, [lineCount]);
  const totals = totalsOf(cart);

  useEffect(() => {
    const t = setTimeout(() => {
      api<CatalogItem[]>('GET', `/pos/catalog?q=${encodeURIComponent(q)}&line=${line}`)
        .then((r) => {
          setItems(r);
          setLoadErr(null);
          setLoaded(true);
        })
        .catch((e) => setLoadErr(errMsg(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [q, line, pos.catalogVersion]);

  const inCart = (key: string) => cart.lines.find((l) => l.item.key === key)?.qty ?? 0;
  const creditOk = !!cart.customer && !cart.customer.blocked;
  const canPay =
    cart.lines.length > 0 &&
    !busy &&
    (cart.payment !== 'EFECTIVO' || (totals.received >= totals.total && totals.received > 0)) &&
    (cart.payment !== 'CREDITO' || (creditOk && totals.total <= (cart.customer?.available ?? 0)));

  async function pay() {
    setBusy(true);
    setPayErr(null);
    try {
      const d = cart.discount;
      const sale = await api<Sale>('POST', '/pos/sales', {
        clientOpId: opId.current,
        items: cart.lines.map((l) => ({ productId: l.item.productId, presentationId: l.item.presentationId ?? undefined, quantity: l.qty })),
        customerId: cart.customer?.id,
        paymentMethod: cart.payment,
        received: cart.payment === 'EFECTIVO' ? totals.received : undefined,
        ...(d ? { ...(d.mode === 'PERCENT' ? { discountPercent: d.value } : { discountAmount: d.value }), authorization: d.authorization } : {}),
      });
      setReceipt(sale);
      pos.clearCart();
      opId.current = uid();
      pos.bumpCatalog();
      void pos.reloadShift();
    } catch (e) {
      setPayErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function choosePayment(m: PayMethod) {
    if (m === 'CREDITO' && !cart.customer) return setModal('customer');
    setCart((c) => ({ ...c, payment: m, received: '' }));
  }

  return (
    <div className="pos-body">
      <section className="catalog">
        <div className="input" style={{ height: 48 }}>
          <Icon name="search" size={18} color="var(--text-3)" />
          <input placeholder="Buscar por código o nombre" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
        </div>
        <div style={{ alignSelf: 'flex-start' }}>
          <Segmented value={line} onChange={setLine} options={LINES} />
        </div>
        {loadErr && (
          <Notice tone="danger" icon="alert">
            {loadErr}
          </Notice>
        )}
        {loaded && items.length === 0 && !loadErr && (
          <Empty icon="search" title="Sin resultados">
            Prueba con otro nombre o código.
          </Empty>
        )}
        <div className="products">
          {items.map((it) => {
            const qty = inCart(it.key);
            const out = it.stockUnits <= 0;
            const maxed = qty >= it.stockUnits;
            return (
              <button
                key={it.key}
                className={`pcard ${qty ? 'sel' : ''} ${out ? 'off' : ''}`}
                disabled={out || maxed}
                onClick={() => pos.add(it)}
                aria-label={`${it.name} ${it.presentation}`}
              >
                <Species line={it.line} />
                <span className="body">
                  <span className="row between">
                    <span className="caption muted">{it.code}</span>
                    {qty > 0 && <span className="qty">{qty}</span>}
                  </span>
                  <span className="title pname">{it.name}</span>
                  <span className="row between">
                    <span className="num price">{mxn(it.price)}</span>
                    <span className="caption" style={{ color: out ? 'var(--danger)' : it.low ? 'var(--warn)' : 'var(--text-3)' }}>
                      {out ? 'Agotado' : `${it.presentation} · ${it.stockUnits} disp.`}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="ticket">
        <div className="ticket-head">
          <div className="row between">
            <span className="h2">
              Venta actual
              {cart.lines.length > 0 && (
                <span className="small muted" style={{ fontFamily: 'var(--f-body)', fontWeight: 400 }}>
                  {' '}
                  · {cart.lines.length} {cart.lines.length === 1 ? 'producto' : 'productos'}
                </span>
              )}
            </span>
            {cart.lines.length > 0 && (
              <button className="link" onClick={pos.clearCart}>
                Vaciar
              </button>
            )}
          </div>
          <button className="customer-btn" onClick={() => setModal('customer')}>
            <Icon name="user" size={16} color="var(--text-2)" />
            <span className="grow small strong">{cart.customer?.name ?? 'Público general'}</span>
            <span className="small strong" style={{ color: 'var(--accent)' }}>
              {cart.customer ? 'Cambiar' : 'Elegir cliente'}
            </span>
          </button>
          {cart.customer?.blocked && (
            <Notice tone="danger" icon="lock">
              Crédito bloqueado: {cart.customer.reason}.
            </Notice>
          )}
        </div>

        <div className="ticket-scroll" ref={listRef}>
          {cart.lines.length === 0 && (
            <Empty icon="receipt" title="Aún no hay productos">
              Toca un producto para agregarlo.
            </Empty>
          )}
          {cart.lines.map((l) => (
            <CartLine key={l.item.key} line={l} onQty={(q) => pos.setQty(l.item.key, q)} onRemove={() => pos.setQty(l.item.key, 0)} />
          ))}
        </div>

        <div className="ticket-foot">
          <div className="col gap4">
            <div className="kv">
              <span className="small muted2">Subtotal</span>
              <span className="small">{mxn(totals.subtotal)}</span>
            </div>
            <div className="kv">
              <span className="small muted2">Descuento{cart.discount ? (cart.discount.mode === 'PERCENT' ? ` (${cart.discount.value} %)` : '') : ''}</span>
              {cart.discount ? (
                <span className="row gap8">
                  <span className="small" style={{ color: 'var(--ok)' }}>
                    − {mxn(totals.discount)}
                  </span>
                  <button className="link" style={{ color: 'var(--danger)' }} onClick={() => setCart((c) => ({ ...c, discount: null }))}>
                    Quitar
                  </button>
                </span>
              ) : (
                <button className="link" disabled={cart.lines.length === 0} onClick={() => setModal('discount')}>
                  Aplicar
                </button>
              )}
            </div>
            <div className="kv">
              <span className="h2">Total</span>
              <span className="num-lg" data-testid="total">
                {mxn(totals.total)}
              </span>
            </div>
          </div>

          <div className="pay-grid">
            {METHODS.map(([m, label, icon]) => (
              <button
                key={m}
                className={`pay ${cart.payment === m ? 'on' : ''}`}
                disabled={m === 'CREDITO' && !!cart.customer?.blocked}
                onClick={() => choosePayment(m)}
              >
                <Icon name={icon} size={18} />
                {label}
              </button>
            ))}
          </div>
          {cart.payment === 'EFECTIVO' && (
            <>
              <div className="cash-row">
                <div className="input" style={{ height: 44 }}>
                  <span className="small muted grow">Recibido</span>
                  <span className="affix">$</span>
                  <input
                    style={{ flex: 'none', width: 96, textAlign: 'right', fontWeight: 600, fontSize: 18 }}
                    inputMode="decimal"
                    value={cart.received}
                    aria-label="Efectivo recibido"
                    onChange={(e) => setCart((c) => ({ ...c, received: e.target.value.replace(/[^\d.]/g, '') }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="change-box">
                  <span className="caption">Cambio</span>
                  <span className="num" data-testid="change">
                    {mxn(totals.change)}
                  </span>
                </div>
              </div>
              <div className="row gap8">
                {quickAmounts(totals.total).map((a, i) => (
                  <button key={a} className={`chip grow ${totals.received === a ? 'on' : ''}`} onClick={() => setCart((c) => ({ ...c, received: String(a) }))}>
                    {i === 0 ? 'Exacto' : mxn(a).replace('.00', '')}
                  </button>
                ))}
              </div>
            </>
          )}
          {cart.payment === 'CREDITO' && cart.customer && (
            <Notice tone={totals.total > cart.customer.available ? 'danger' : 'info'} icon="clock">
              Crédito disponible {mxn(cart.customer.available)} de {mxn(cart.customer.creditLimit)} · plazo {cart.customer.creditDays} días.
              {totals.total > cart.customer.available ? ' La venta excede el crédito disponible.' : ''}
            </Notice>
          )}
          {payErr && (
            <Notice tone="danger" icon="alert">
              {payErr}
            </Notice>
          )}

          <div className="row pay-actions" style={{ gap: 10 }}>
            <Button size="lg" onClick={pos.clearCart} disabled={cart.lines.length === 0}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" icon="printer" disabled={!canPay} onClick={pay}>
              {busy ? 'Cobrando…' : 'Cobrar e imprimir ticket'}
            </Button>
          </div>
        </div>
      </aside>

      {modal === 'customer' && (
        <CustomerModal
          current={cart.customer}
          onClose={() => setModal(null)}
          onPick={(c) => {
            setCart((x) => ({ ...x, customer: c, payment: !c || c.blocked ? (x.payment === 'CREDITO' ? 'EFECTIVO' : x.payment) : x.payment }));
            setModal(null);
          }}
        />
      )}
      {modal === 'discount' && (
        <DiscountModal
          subtotal={totals.subtotal}
          onClose={() => setModal(null)}
          onApply={(d) => {
            setCart((c) => ({ ...c, discount: d }));
            setModal(null);
          }}
        />
      )}
      {receipt && (
        <ReceiptModal
          title={`Venta ${folio(receipt.folio)} registrada`}
          sub={`${mxn(receipt.total)} · ${receipt.paymentMethod === 'EFECTIVO' ? `cambio ${mxn(receipt.change ?? 0)}` : receipt.paymentMethod.toLowerCase()}`}
          onClose={() => setReceipt(null)}
          render={(mm) => <SaleReceipt sale={receipt} mm={mm} />}
        />
      )}
    </div>
  );
}

function CustomerModal({ current, onPick, onClose }: { current: CreditInfo | null; onPick: (c: CreditInfo | null) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CreditInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<CreditInfo[]>('GET', `/pos/customers?q=${encodeURIComponent(q)}`)
        .then(setRows)
        .catch((e) => setErr(errMsg(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title="Cliente" sub="Elige un cliente para vender a crédito" onClose={onClose}>
      <Input icon="search" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Buscar cliente" />
      {err && (
        <Notice tone="danger" icon="alert">
          {err}
        </Notice>
      )}
      <div className="col" style={{ gap: 8 }}>
        <button
          className="row card"
          style={{ padding: '10px 14px', textAlign: 'left', borderColor: !current ? 'var(--accent)' : undefined }}
          onClick={() => onPick(null)}
        >
          <Icon name="user" size={16} color="var(--text-2)" />
          <span className="grow small strong">Público general</span>
          <span className="caption muted">Sin crédito</span>
        </button>
        {rows.map((c) => (
          <button
            key={c.id}
            className="card"
            style={{ padding: '10px 14px', textAlign: 'left', borderColor: current?.id === c.id ? 'var(--accent)' : undefined }}
            onClick={() => onPick(c)}
            aria-label={`Cliente ${c.name}`}
          >
            <div className="row between">
              <span className="small strong">{c.name}</span>
              {c.blocked ? (
                <Badge tone="danger">
                  <Icon name="lock" size={11} /> Crédito bloqueado
                </Badge>
              ) : (
                <Badge tone="ok">Disponible {mxn(c.available)}</Badge>
              )}
            </div>
            <div className="caption muted">
              Saldo {mxn(c.balance)} · límite {mxn(c.creditLimit)} · {c.creditDays} días{c.blocked && c.reason ? ` · ${c.reason}` : ''}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DiscountModal({
  subtotal,
  onApply,
  onClose,
}: {
  subtotal: number;
  onApply: (d: { mode: 'PERCENT' | 'AMOUNT'; value: number; authorization: { username: string; password: string } }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [value, setValue] = useState('5');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = Number(value) || 0;
  const amount = Math.round((mode === 'PERCENT' ? (subtotal * Math.min(v, 100)) / 100 : Math.min(v, subtotal)) * 100) / 100;

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/pos/authorize', { username: username.trim(), password });
      onApply({ mode, value: v, authorization: { username: username.trim(), password } });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Aplicar descuento"
      sub="Requiere autorización de un supervisor"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy || !(v > 0) || !username || !password} onClick={apply}>
            {busy ? 'Validando…' : 'Autorizar y aplicar'}
          </Button>
        </>
      }
    >
      <Field label="Aplicar a">
        <Segmented
          soft
          value={mode}
          onChange={(m) => {
            setMode(m);
            setValue(m === 'PERCENT' ? '5' : '');
          }}
          options={[
            ['PERCENT', 'Porcentaje'],
            ['AMOUNT', 'Monto en pesos'],
          ]}
        />
      </Field>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="grow">
          <Field label="Descuento">
            <Input
              inputMode="decimal"
              prefix={mode === 'AMOUNT' ? '$' : undefined}
              suffix={mode === 'PERCENT' ? <span className="affix">%</span> : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
              aria-label="Valor del descuento"
            />
          </Field>
        </div>
        {mode === 'PERCENT' && (
          <div className="row gap8">
            {[5, 10, 15].map((p) => (
              <button key={p} className={`chip ${v === p ? 'on' : ''}`} style={{ height: 44 }} onClick={() => setValue(String(p))}>
                {p} %
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tile col gap8">
        <div className="kv">
          <span className="small muted2">Subtotal</span>
          <span className="small">{mxn(subtotal)}</span>
        </div>
        <div className="kv">
          <span className="small muted2">Descuento</span>
          <span className="small" style={{ color: 'var(--ok)' }}>
            − {mxn(amount)}
          </span>
        </div>
        <div className="kv">
          <span className="title">Total a cobrar</span>
          <span className="title">{mxn(subtotal - amount)}</span>
        </div>
      </div>
      <div className="col gap12">
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
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
