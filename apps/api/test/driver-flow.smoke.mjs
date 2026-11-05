// Prueba de humo del flujo del repartidor contra una API en marcha.
// Requiere datos de demostración recientes: `npm run seed -w apps/api` (reinicia la ruta de hoy).
// Uso: node apps/api/test/driver-flow.smoke.mjs [http://localhost:3000]
const BASE = process.argv[2] ?? 'http://localhost:3000';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let token;
let failed = 0;

async function call(method, path, body, auth = true) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
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
const stockOf = async (adminToken, code) => {
  const res = await fetch(BASE + '/inventory', { headers: { Authorization: `Bearer ${adminToken}` } });
  const rows = await res.json();
  return rows.find((r) => r.code === code)?.stock;
};

const login = await call('POST', '/auth/login', { username: 'chofer', password: 'cambiar123' }, false);
check('login chofer', login.status === 201 && login.json.user.role === 'CHOFER');
token = login.json.accessToken;
const admin = await call('POST', '/auth/login', { username: 'admin', password: 'cambiar123' }, false);
const adminToken = admin.json.accessToken;

const cajero = await call('POST', '/auth/login', { username: 'cajero', password: 'cambiar123' }, false);
const denied = await fetch(BASE + '/driver/route', { headers: { Authorization: `Bearer ${cajero.json.accessToken}` } });
check('un cajero no puede usar la API del repartidor', denied.status === 403);

const r = await call('GET', '/driver/route');
check('ruta de hoy', r.status === 200 && r.json.stops.length === 5, `${r.json.name} · ${r.json.status}`);
const route = r.json;
const before = await stockOf(adminToken, 'BV-001');

const early = await call('POST', `/driver/stops/${route.stops[0].id}/deliver`, { clientOpId: 'smoke-early', signature: PNG });
check('no se puede entregar antes de salir', early.status === 400, early.json.message);

const start = await call('POST', `/driver/routes/${route.id}/start`);
check('carga y salida', start.status === 201 && start.json.status === 'EN_CURSO');
const afterLoad = await stockOf(adminToken, 'BV-001');
check('el inventario baja al cargar (9 sacos × 40 kg)', before - afterLoad === 360, `${before} → ${afterLoad}`);
const again = await call('POST', `/driver/routes/${route.id}/start`);
check('cargar dos veces no descuenta de nuevo', again.status === 201 && (await stockOf(adminToken, 'BV-001')) === afterLoad);

const noProof = await call('POST', `/driver/stops/${route.stops[0].id}/deliver`, { clientOpId: 'smoke-noproof' });
check('exige firma o foto', noProof.status === 400, noProof.json.message);

const [s1, s2, s3, s4, s5] = route.stops;
const d1 = await call('POST', `/driver/stops/${s1.id}/deliver`, { clientOpId: 'smoke-d1', signature: PNG, payment: { amount: s1.total, method: 'EFECTIVO' } });
check('entrega parada 1 con cobro', d1.status === 201 && d1.json.ok);
const d1b = await call('POST', `/driver/stops/${s1.id}/deliver`, { clientOpId: 'smoke-d1', signature: PNG, payment: { amount: s1.total, method: 'EFECTIVO' } });
check('reenviar la misma entrega es idempotente', d1b.json.duplicate === true);

const f2 = await call('POST', `/driver/stops/${s2.id}/fail`, { clientOpId: 'smoke-f2', reason: 'CLIENTE_AUSENTE', notes: 'Nadie atendió' });
check('no entrega parada 2', f2.status === 201 && f2.json.ok);
const d3 = await call('POST', `/driver/stops/${s3.id}/deliver`, { clientOpId: 'smoke-d3', photo: PNG, payment: { amount: s3.total, method: 'TRANSFERENCIA' } });
check('entrega parada 3 con foto y transferencia', d3.status === 201);

const closeEarly = await call('POST', `/driver/routes/${route.id}/close`, {});
check('no cierra con paradas pendientes', closeEarly.status === 400, closeEarly.json.message);

const it4 = s4.items[0];
const over = await call('POST', `/driver/stops/${s4.id}/deliver`, { clientOpId: 'smoke-over', signature: PNG, items: [{ id: it4.id, qty: it4.quantity + 1 }] });
check('no se puede entregar más de lo pedido', over.status === 400, over.json.message);
const foreign = await call('POST', `/driver/stops/${s4.id}/deliver`, { clientOpId: 'smoke-foreign', signature: PNG, items: [{ id: s5.items[0].id, qty: 1 }] });
check('rechaza un producto de otra parada', foreign.status === 400, foreign.json.message);
const none = await call('POST', `/driver/stops/${s4.id}/deliver`, { clientOpId: 'smoke-none', signature: PNG, items: s4.items.map((i) => ({ id: i.id, qty: 0 })) });
check('entregar cero de todo pide registrar no entrega', none.status === 400, none.json.message);
const leftBefore = (await call('GET', `/driver/routes/${route.id}/summary`)).json.leftover.find((l) => l.code === it4.code)?.quantity ?? 0;
const d4 = await call('POST', `/driver/stops/${s4.id}/deliver`, { clientOpId: 'smoke-d4', signature: PNG, items: [{ id: it4.id, qty: it4.quantity - 1 }] });
check('entrega parcial de la parada 4 (1 saco menos)', d4.status === 201 && d4.json.ok);
const leftAfter = (await call('GET', `/driver/routes/${route.id}/summary`)).json.leftover.find((l) => l.code === it4.code)?.quantity ?? 0;
check('al entregar la parada 4 solo queda por regresar 1 saco de ella', leftAfter - leftBefore === 1 - it4.quantity, `${leftBefore} → ${leftAfter}`);
await call('POST', `/driver/stops/${s5.id}/deliver`, { clientOpId: 'smoke-d5', signature: PNG, payment: { amount: s5.total, method: 'EFECTIVO' } });
const extra = await call('POST', '/driver/payments', { clientOpId: 'smoke-p1', routeId: route.id, customerId: s2.customer.id, amount: 500, method: 'EFECTIVO' });
check('cobro suelto', extra.status === 201);

const inc = await call('POST', '/driver/incidents', { clientOpId: 'smoke-i1', routeId: route.id, type: 'PRODUCTO_DANADO', description: 'Saco roto' });
check('incidencia', inc.status === 201);
const incs = await call('GET', `/driver/routes/${route.id}/incidents`);
check('lista de incidencias (incluye la no entrega)', incs.json.length === 2, `${incs.json.length}`);

const pay = await call('GET', `/driver/routes/${route.id}/payments`);
const expected = s1.total + s3.total + s5.total + 500;
check('total cobrado', pay.json.total === expected, `$${pay.json.total}`);

const sum = await call('GET', `/driver/routes/${route.id}/summary`);
check('resumen', sum.json.delivered === 4 && sum.json.failed === 1 && sum.json.pending === 0, JSON.stringify({ d: sum.json.delivered, f: sum.json.failed }));

const close = await call('POST', `/driver/routes/${route.id}/close`, {});
check('cierre de ruta', close.status === 201 && close.json.status === 'FINALIZADA');
const afterClose = await stockOf(adminToken, 'OV-001');
const expectedOv = 3 + (it4.code === 'OV-001' ? 1 : 0); // + el saco que quedó de la entrega parcial
check(`lo no entregado regresa al almacén (${expectedOv} sacos de OV-001)`, close.json.leftover.some((l) => l.code === 'OV-001' && l.quantity === expectedOv), `OV-001 stock ${afterClose}`);

console.log(failed ? `\n${failed} verificación(es) fallaron` : '\nTodo correcto');
process.exit(failed ? 1 : 0);
