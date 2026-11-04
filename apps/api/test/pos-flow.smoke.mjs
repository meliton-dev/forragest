// Prueba de humo del punto de venta contra una API en marcha.
// Requiere los datos de demostración: `npm run db:seed`. Puede correrse varias veces.
// Uso: node apps/api/test/pos-flow.smoke.mjs [http://localhost:3000]
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
  console.log(`${cond ? 'OK   ' : 'FALLA'} ${name}${extra ? ' · ' + extra : ''}`);
}
const login = async (username) => (await call(null, 'POST', '/auth/login', { username, password: 'cambiar123' })).json.accessToken;
const cajero = await login('cajero');
const admin = await login('admin');
const stockKg = async (code) => (await call(admin, 'GET', '/inventory')).json.find((r) => r.code === code)?.stock;
const SUP = { username: 'supervisor', password: 'cambiar123' };

const denied = await call(await login('chofer'), 'GET', '/pos/catalog');
check('un chofer no puede usar el POS', denied.status === 403);

// ---- turno
const cur = await call(cajero, 'GET', '/pos/shift');
if (cur.json && cur.json.shift) await call(cajero, 'POST', '/pos/shift/close', { countedCash: cur.json.expectedCash });
const noShift = await call(cajero, 'POST', '/pos/sales', { items: [{ productId: 1, quantity: 1 }], paymentMethod: 'EFECTIVO', received: 9999 });
check('no se vende sin turno abierto', noShift.status === 400, noShift.json.message);
const open = await call(cajero, 'POST', '/pos/shift/open', { openingFloat: 1000 });
check('abrir turno con fondo de $1,000', open.status === 201);
const dupOpen = await call(cajero, 'POST', '/pos/shift/open', { openingFloat: 5 });
check('no se abren dos turnos', dupOpen.status === 409);

// ---- catálogo
const cat = (await call(cajero, 'GET', '/pos/catalog')).json;
const find = (code, pres) => cat.find((c) => c.code === code && c.presentation === pres);
const bv = find('BV-001', 'Saco 40 kg');
const av = find('AV-001', 'Saco 40 kg');
const agotado = find('BV-002', 'Saco 25 kg');
check('catálogo con precios por presentación', bv?.price === 430 && av?.price === 380, `BV-001 $${bv?.price}, AV-001 $${av?.price}`);
check('producto sin existencia aparece con 0', agotado?.stockUnits === 0);
const busca = (await call(cajero, 'GET', '/pos/catalog?q=postura')).json;
check('búsqueda por nombre', busca.length >= 1 && busca.every((c) => /postura/i.test(c.name)));

// ---- venta en efectivo
const bv0 = await stockKg('BV-001');
const av0 = await stockKg('AV-001');
const lines = [{ productId: bv.productId, presentationId: bv.presentationId, quantity: 2 }, { productId: av.productId, presentationId: av.presentationId, quantity: 1 }];
const s1 = await call(cajero, 'POST', '/pos/sales', { clientOpId: 'smoke-pos-1-' + Date.now(), items: lines, paymentMethod: 'EFECTIVO', received: 1500 });
check('venta de contado: total, recibido y cambio', s1.status === 201 && s1.json.total === 1240 && s1.json.change === 260, `folio ${s1.json.folio}`);
check('el inventario baja en tiempo real (80 kg y 40 kg)', bv0 - (await stockKg('BV-001')) === 80 && av0 - (await stockKg('AV-001')) === 40);
const lowCash = await call(cajero, 'POST', '/pos/sales', { items: lines, paymentMethod: 'EFECTIVO', received: 100 });
check('efectivo insuficiente se rechaza', lowCash.status === 400, lowCash.json.message);
const opId = 'smoke-pos-idem-' + Date.now();
const a = await call(cajero, 'POST', '/pos/sales', { clientOpId: opId, items: [lines[1]], paymentMethod: 'TARJETA' });
const b = await call(cajero, 'POST', '/pos/sales', { clientOpId: opId, items: [lines[1]], paymentMethod: 'TARJETA' });
check('reenviar la misma venta no la duplica', a.json.folio === b.json.folio);

// ---- descuento con autorización
const noAuth = await call(cajero, 'POST', '/pos/sales', { items: lines, paymentMethod: 'EFECTIVO', received: 2000, discountPercent: 5 });
check('descuento sin autorización → 403', noAuth.status === 403);
const badAuth = await call(cajero, 'POST', '/pos/sales', { items: lines, paymentMethod: 'EFECTIVO', received: 2000, discountPercent: 5, authorization: { username: 'cajero', password: 'cambiar123' } });
check('un cajero no puede autorizar su propio descuento', badAuth.status === 403);
const wrongPw = await call(cajero, 'POST', '/pos/sales', { items: lines, paymentMethod: 'EFECTIVO', received: 2000, discountPercent: 5, authorization: { username: 'supervisor', password: 'mala' } });
check('contraseña de supervisor incorrecta → 403', wrongPw.status === 403);
const disc = await call(cajero, 'POST', '/pos/sales', { items: lines, paymentMethod: 'EFECTIVO', received: 1200, discountPercent: 5, authorization: SUP });
check('descuento 5 % autorizado por supervisor', disc.status === 201 && disc.json.discountAmount === 62 && disc.json.total === 1178 && disc.json.change === 22, `total $${disc.json.total}`);

// ---- existencia insuficiente
const sinStock = await call(cajero, 'POST', '/pos/sales', { items: [{ productId: agotado.productId, presentationId: agotado.presentationId, quantity: 1 }], paymentMethod: 'EFECTIVO', received: 1000 });
check('sin existencia se rechaza y nombra el producto', sinStock.status === 400 && /Sal mineralizada/.test(sinStock.json.message), sinStock.json.message);

// ---- crédito
const customers = (await call(cajero, 'GET', '/pos/customers')).json;
const borregos = customers.find((c) => c.name === 'Borregos La Loma');
const pinos = customers.find((c) => c.name === 'Establo Los Pinos');
check('alerta de saldo vencido del cliente', borregos.blocked === true && borregos.overdue === 14300, borregos.reason);
const blocked = await call(cajero, 'POST', '/pos/sales', { items: [lines[1]], paymentMethod: 'CREDITO', customerId: borregos.id });
check('venta a crédito a cliente con saldo vencido → bloqueada', blocked.status === 400 && /bloqueado/i.test(blocked.json.message), blocked.json.message);
const noCust = await call(cajero, 'POST', '/pos/sales', { items: [lines[1]], paymentMethod: 'CREDITO' });
check('crédito exige cliente', noCust.status === 400);
const bal0 = (await call(cajero, 'GET', `/pos/customers/${pinos.id}/credit`)).json.balance;
const cred = await call(cajero, 'POST', '/pos/sales', { items: lines, paymentMethod: 'CREDITO', customerId: pinos.id });
check('venta a crédito a cliente al corriente', cred.status === 201 && cred.json.status === 'POR_COBRAR' && cred.json.balance === 1240 && !!cred.json.dueDate);
const bal1 = (await call(cajero, 'GET', `/pos/customers/${pinos.id}/credit`)).json.balance;
check('el saldo del cliente aumenta', bal1 - bal0 === 1240, `${bal0} → ${bal1}`);

// ---- devolución con nota de crédito
const bvBeforeReturn = await stockKg('BV-001');
const ret = await call(cajero, 'POST', '/pos/returns', { saleId: s1.json.id, items: [{ saleItemId: s1.json.items[0].id, quantity: 1 }], reason: 'Producto en mal estado', refundMethod: 'EFECTIVO' });
check('devolución de 1 saco genera nota de crédito', ret.status === 201 && ret.json.total === 430 && ret.json.folio > 0, `NC ${ret.json.folio}`);
check('la devolución regresa 40 kg al inventario', (await stockKg('BV-001')) - bvBeforeReturn === 40);
const over = await call(cajero, 'POST', '/pos/returns', { saleId: s1.json.id, items: [{ saleItemId: s1.json.items[0].id, quantity: 5 }], reason: 'x' });
check('no se puede devolver más de lo vendido', over.status === 400, over.json.message);
const retDisc = await call(cajero, 'POST', '/pos/returns', { saleId: disc.json.id, items: [{ saleItemId: disc.json.items[1].id, quantity: 1 }], reason: 'Cambio', refundMethod: 'EFECTIVO' });
check('la devolución prorratea el descuento de la venta (380 − 5 % = 361)', retDisc.json.total === 361, `$${retDisc.json.total}`);
const retCredit = await call(cajero, 'POST', '/pos/returns', { saleId: cred.json.id, items: [{ saleItemId: cred.json.items[1].id, quantity: 1 }], reason: 'No lo necesitaba' });
check('devolver una venta a crédito baja el saldo del cliente', retCredit.json.refundMethod === 'SALDO_A_FAVOR' && (await call(cajero, 'GET', `/pos/customers/${pinos.id}/credit`)).json.balance === bal1 - 380);

// ---- cancelación con autorización
const toCancel = await call(cajero, 'POST', '/pos/sales', { items: [lines[1]], paymentMethod: 'EFECTIVO', received: 400 });
const avBefore = await stockKg('AV-001');
const cNo = await call(cajero, 'POST', `/pos/sales/${toCancel.json.id}/cancel`, { reason: 'Error de captura', authorization: { username: 'supervisor', password: 'x' } });
check('cancelar sin autorización válida → 403', cNo.status === 403);
const cOk = await call(cajero, 'POST', `/pos/sales/${toCancel.json.id}/cancel`, { reason: 'Error de captura', authorization: SUP });
check('cancelación autorizada', cOk.status === 201 && cOk.json.status === 'CANCELADA');
check('cancelar regresa el producto al inventario (40 kg)', (await stockKg('AV-001')) - avBefore === 40);
const cTwice = await call(cajero, 'POST', `/pos/sales/${toCancel.json.id}/cancel`, { reason: 'otra vez', authorization: SUP });
check('no se cancela dos veces', cTwice.status === 400);
const cRet = await call(cajero, 'POST', `/pos/sales/${s1.json.id}/cancel`, { reason: 'x', authorization: SUP });
check('no se cancela una venta con devoluciones', cRet.status === 400);

// ---- listado y corte
const list = (await call(cajero, 'GET', '/pos/sales')).json;
check('ventas del día', list.length >= 5 && list.some((s) => s.status === 'CANCELADA'), `${list.length} ventas`);
const sum = (await call(cajero, 'GET', '/pos/shift')).json;
const expectedCash = 1000 + 1240 + 1178 - 430 - 361 + 0; // fondo + efectivo (s1, descuento) − reembolsos en efectivo
check('corte: efectivo esperado = fondo + ventas en efectivo − reembolsos', sum.expectedCash === expectedCash, `$${sum.expectedCash} (esperado $${expectedCash})`);
check('corte: totales por forma de pago', sum.byMethod.CREDITO.total === 1240 && sum.byMethod.TARJETA.count === 1 && sum.cancelledCount === 1);
const closed = await call(cajero, 'POST', '/pos/shift/close', { countedCash: sum.expectedCash - 10, notes: 'Prueba', denominations: { 500: 2 } });
check('cierre de turno con diferencia de −$10', closed.status === 201 && closed.json.difference === -10, `dif $${closed.json.difference}`);
const afterClose = await call(cajero, 'POST', '/pos/sales', { items: [lines[1]], paymentMethod: 'TARJETA' });
check('con el turno cerrado no se puede vender', afterClose.status === 400);

console.log(failed ? `\n${failed} verificación(es) fallaron` : '\nTodo correcto');
process.exit(failed ? 1 : 0);
