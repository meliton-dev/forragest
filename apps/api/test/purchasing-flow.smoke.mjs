// Prueba de humo del módulo de compras contra una API en marcha (con los datos de `npm run seed -w apps/api`).
// Uso: node apps/api/test/purchasing-flow.smoke.mjs [http://localhost:3000]
const BASE = process.argv[2] ?? 'http://localhost:3000';
let failed = 0;

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
function check(name, cond, extra = '') {
  if (!cond) failed++;
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${name}${extra ? ' · ' + extra : ''}`);
}
const login = async (username) => (await call(null, 'POST', '/auth/login', { username, password: 'cambiar123' })).json.accessToken;

const compras = await login('compras');
const admin = await login('admin');
const cajero = await login('cajero');
const stockOf = async (code) => (await call(admin, 'GET', '/inventory')).json.find((r) => r.code === code)?.stock;

check('un cajero no puede usar compras', (await call(cajero, 'GET', '/purchasing/suppliers')).status === 403);

// ---- COM-001 proveedores
const stamp = String(Date.now()).slice(-6);
const rfc = `SMK${stamp}AB1`;
const lines = (await call(compras, 'GET', '/purchasing/options')).json.lines;
const bad = await call(compras, 'POST', '/purchasing/suppliers', { name: 'RFC malo', rfc: '123' });
check('rechaza un RFC con formato inválido', bad.status === 400, JSON.stringify(bad.json.message));
const sup = await call(compras, 'POST', '/purchasing/suppliers', { name: `Proveedor de prueba ${stamp}`, rfc, paymentDays: 10, lineIds: [lines[0].id] });
check('crea proveedor con RFC, crédito y línea', sup.status === 201 && sup.json.paymentDays === 10 && sup.json.lines.length === 1);
const dup = await call(compras, 'POST', '/purchasing/suppliers', { name: 'Otro', rfc });
check('no permite repetir el RFC', dup.status === 409, dup.json.message);
const upd = await call(compras, 'POST', `/purchasing/suppliers/${sup.json.id}`, { name: `Proveedor de prueba ${stamp}`, rfc, paymentDays: 15, lineIds: lines.map((l) => l.id), active: true });
check('edita condiciones de pago y líneas', upd.json.paymentDays === 15 && upd.json.lines.length === lines.length);

// ---- COM-002 orden de compra
const products = (await call(compras, 'GET', '/purchasing/options')).json.products;
const [p1, p2] = products;
const dupItems = await call(compras, 'POST', '/purchasing/orders', { supplierId: sup.json.id, items: [{ productId: p1.id, quantity: 10, unitCost: 5 }, { productId: p1.id, quantity: 5, unitCost: 5 }] });
check('rechaza un producto repetido en la orden', dupItems.status === 400, dupItems.json.message);
const order = await call(compras, 'POST', '/purchasing/orders', { supplierId: sup.json.id, notes: 'Prueba', items: [{ productId: p1.id, quantity: 100, unitCost: 10 }, { productId: p2.id, quantity: 50, unitCost: 4.5 }] });
check('crea la orden en borrador con folio y total', order.status === 201 && order.json.status === 'BORRADOR' && /^OC-\d{5}$/.test(order.json.folio) && order.json.total === 1225, `${order.json.folio} $${order.json.total}`);
const id = order.json.id;
const [i1, i2] = order.json.items;

const early = await call(compras, 'POST', `/purchasing/orders/${id}/receive`, { items: [{ orderItemId: i1.id, quantity: 10 }] });
check('no se recibe una orden que no se ha enviado', early.status === 400, early.json.message);
const sent = await call(compras, 'POST', `/purchasing/orders/${id}/send`);
check('envía la orden al proveedor', sent.json.status === 'ENVIADA');

// ---- COM-003 recepción parcial con diferencias
const s1 = await stockOf(p1.code);
const over = await call(compras, 'POST', `/purchasing/orders/${id}/receive`, { items: [{ orderItemId: i1.id, quantity: 101 }] });
check('no se recibe más de lo pedido', over.status === 400, over.json.message);
const none = await call(compras, 'POST', `/purchasing/orders/${id}/receive`, { items: [{ orderItemId: i1.id, quantity: 0 }] });
check('exige recibir al menos algo', none.status === 400, none.json.message);
const part = await call(compras, 'POST', `/purchasing/orders/${id}/receive`, { notes: 'Primer camión', items: [{ orderItemId: i1.id, quantity: 60, note: 'Llegaron 60 de 100' }, { orderItemId: i2.id, quantity: 0, note: 'Sin existencia' }] });
check('recepción parcial deja la orden en PARCIAL', part.status === 201 && part.json.status === 'PARCIAL' && part.json.items[0].pending === 40, `pendiente ${part.json.items[0].pending}`);
check('la recepción entra al inventario', (await stockOf(p1.code)) - s1 === 60, `${s1} → ${await stockOf(p1.code)}`);
check('la recepción guarda la diferencia anotada', part.json.receipts[0].items.some((x) => x.note === 'Llegaron 60 de 100'));
check('genera cuenta por pagar por lo recibido ($600)', part.json.payables.length === 1 && part.json.payables[0].amount === 600, JSON.stringify(part.json.payables.map((p) => p.amount)));
const cancelPartial = await call(compras, 'POST', `/purchasing/orders/${id}/cancel`);
check('una orden con mercancía recibida no se cancela', cancelPartial.status === 400, cancelPartial.json.message);

const last = await call(compras, 'POST', `/purchasing/orders/${id}/receive`, { closeShort: true, items: [{ orderItemId: i1.id, quantity: 40 }, { orderItemId: i2.id, quantity: 20, note: 'El proveedor no surte más' }] });
check('cerrar con faltante deja la orden RECIBIDA y registra lo que faltó (30)', last.json.status === 'RECIBIDA' && last.json.shortage.length === 1 && last.json.shortage[0].missing === 30, JSON.stringify(last.json.shortage));
check('dos recepciones = dos cuentas por pagar', last.json.payables.length === 2);
const closed = await call(compras, 'POST', `/purchasing/orders/${id}/receive`, { items: [{ orderItemId: i2.id, quantity: 1 }] });
check('una orden cerrada ya no recibe', closed.status === 400, closed.json.message);

// ---- COM-004 historial y precios
const hist = await call(compras, 'GET', `/purchasing/price-history?productId=${p1.id}`);
check('historial de precios por producto', hist.json.rows.some((r) => r.folio === order.json.folio && r.unitCost === 10) && hist.json.comparison.some((c) => c.supplierId === sup.json.id && c.last === 10));
const draft = await call(compras, 'POST', '/purchasing/orders', { supplierId: sup.json.id, items: [{ productId: p1.id, quantity: 1, unitCost: 99 }] });
const hist2 = await call(compras, 'GET', `/purchasing/price-history?productId=${p1.id}&supplierId=${sup.json.id}`);
check('un borrador no cuenta en el historial de precios', !hist2.json.rows.some((r) => r.unitCost === 99));
const cancelled = await call(compras, 'POST', `/purchasing/orders/${draft.json.id}/cancel`);
check('cancela un borrador', cancelled.json.status === 'CANCELADA');

// ---- COM-005 sugerencias
const sug = await call(compras, 'GET', '/purchasing/suggestions');
check('sugerencias con cantidad positiva', Array.isArray(sug.json) && sug.json.every((s) => s.quantity > 0), `${sug.json.length} producto(s)`);

// ---- COM-006 / COM-007 cuentas por pagar
const pay = await call(compras, 'GET', `/purchasing/payables?supplierId=${sup.json.id}`);
const total = pay.json.items.reduce((a, p) => a + p.amount, 0);
check('cuentas por pagar de la orden ($600 + $490)', pay.json.items.length === 2 && Math.abs(total - 1090) < 0.01, `$${total}`);
check('vencimiento a 15 días según el proveedor', pay.json.items.every((p) => p.daysToDue === 15 && p.status === 'PENDIENTE'), JSON.stringify(pay.json.items.map((p) => p.daysToDue)));
const first = pay.json.items[0];
const overpay = await call(compras, 'POST', `/purchasing/payables/${first.id}/pay`, { amount: first.balance + 1 });
check('no se paga más que el saldo', overpay.status === 400, overpay.json.message);
const half = await call(compras, 'POST', `/purchasing/payables/${first.id}/pay`, { amount: 100 });
check('pago parcial deja saldo', half.json.balance === first.balance - 100 && half.json.status !== 'PAGADA');
const full = await call(compras, 'POST', `/purchasing/payables/${first.id}/pay`, { amount: half.json.balance });
check('liquidar la cuenta la marca pagada', full.json.status === 'PAGADA' && full.json.balance === 0);
const again = await call(compras, 'POST', `/purchasing/payables/${first.id}/pay`, { amount: 1 });
check('no se paga una cuenta ya pagada', again.status === 400, again.json.message);

const al = await call(compras, 'GET', '/purchasing/alerts');
check('alertas con totales', typeof al.json.totals?.overdue === 'number' && Array.isArray(al.json.overdue) && Array.isArray(al.json.dueSoon), `vencido $${al.json.totals?.overdue} · por vencer $${al.json.totals?.dueSoon}`);
check('las cuentas de esta prueba (a 15 días) no son alerta', !al.json.dueSoon.some((p) => p.supplierId === sup.json.id));

console.log(failed ? `\n${failed} verificación(es) fallaron` : '\nTodo correcto');
process.exit(failed ? 1 : 0);
