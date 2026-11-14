// Prueba de humo del módulo de Rutas (supervisor + repartidor) contra una API en marcha.
// Requiere datos recientes: `npm run db:seed` (deja la ruta de hoy del chofer sin iniciar).
// Uso: node apps/api/test/routes-flow.smoke.mjs [http://localhost:3000]
const BASE = process.argv[2] ?? 'http://localhost:3000';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let failed = 0;

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}
function check(name, cond, extra = '') {
  if (!cond) failed++;
  console.log(`${cond ? 'OK   ' : 'FALLA'} ${name}${extra ? ' · ' + extra : ''}`);
}
const login = async (u) => (await call(null, 'POST', '/auth/login', { username: u, password: 'cambiar123' })).json.accessToken;
const sup = await login('supervisor');
const chofer = await login('chofer');
// Las horas estimadas son de la hora del negocio (APP_TIMEZONE, por defecto America/Mexico_City), no de la zona de esta máquina.
const TZ = process.env.APP_TIMEZONE || 'America/Mexico_City';
const zoneParts = (d) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
const zoneOffset = (d) => {
  const p = zoneParts(d);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
};
const localAt = (h, m) => {
  const t = zoneParts(new Date());
  const guess = Date.UTC(t.year, t.month - 1, t.day, h, m);
  const first = guess - zoneOffset(new Date(guess));
  return new Date(guess - zoneOffset(new Date(first))).toISOString();
};

// ---- permisos
check('un chofer no puede usar el módulo del supervisor', (await call(chofer, 'GET', '/routes')).status === 403);
check('un cajero tampoco', (await call(await login('cajero'), 'GET', '/routes')).status === 403);

// ---- opciones y creación
const opt = (await call(sup, 'GET', '/routes/options')).json;
check(
  'opciones: repartidores, camiones, clientes con coordenadas y catálogo',
  opt.drivers.length >= 2 && opt.vehicles.length >= 1 && opt.customers.some((c) => c.lat) && opt.catalog.length > 5,
  `${opt.drivers.length} repartidores`,
);
const marco = opt.drivers.find((d) => d.username === 'chofer2');
const camion = opt.vehicles[0];
const cat = (code, pres) => opt.catalog.find((c) => c.code === code && c.presentation === pres);
const bv = cat('BV-001', 'Saco 40 kg');
const av = cat('AV-001', 'Saco 40 kg');
const cust = (name) => opt.customers.find((c) => c.name === name);
const date = new Date(Date.now() + (100 + (Date.now() % 200)) * 86400000).toISOString().slice(0, 10); // fecha futura única: la prueba se puede repetir
const body = {
  name: 'Ruta 03 · Centro (e2e)',
  date,
  driverId: marco.id,
  vehicleId: camion.id,
  plannedDeparture: '14:00',
  stops: [
    {
      customerId: cust('Rancho San Miguel').id,
      eta: '14:35',
      paymentTerms: 'CONTADO',
      items: [{ productId: bv.productId, presentationId: bv.presentationId, quantity: 3 }],
    },
    {
      customerId: cust('Granja Avícola Sol').id,
      eta: '15:10',
      paymentTerms: 'CREDITO',
      instructions: 'Entregar en bodega 2',
      items: [{ productId: av.productId, presentationId: av.presentationId, quantity: 2 }],
    },
  ],
};
check('no se crea una ruta sin paradas', (await call(sup, 'POST', '/routes', { ...body, stops: [] })).status === 400);
check('el “repartidor” debe ser un chofer', (await call(sup, 'POST', '/routes', { ...body, driverId: 1 })).status === 400);
check('la hora estimada se valida (HH:MM)', (await call(sup, 'POST', '/routes', { ...body, stops: [{ ...body.stops[0], eta: '25:99' }] })).status === 400);
const created = await call(sup, 'POST', '/routes', body);
check(
  'crear y asignar una ruta',
  created.status === 201 && created.json.status === 'PROGRAMADA' && created.json.stops.total === 2 && created.json.driver.name === 'Marco Díaz',
  created.json.name,
);
check('precios calculados en el servidor (3 × $430 y 2 × $380)', created.json.stopsDetail[0].total === 1290 && created.json.stopsDetail[1].total === 760);
check('el plazo de crédito sale del cliente', created.json.stopsDetail[1].paymentTerms.startsWith('Crédito'), created.json.stopsDetail[1].paymentTerms);
check('un repartidor no puede tener dos rutas sin terminar el mismo día', (await call(sup, 'POST', '/routes', body)).status === 409);
const sched = (await call(sup, 'GET', '/routes?scope=scheduled')).json;
check(
  'aparece en “programadas”',
  sched.routes.some((r) => r.id === created.json.id),
);

// ---- el repartidor: llegada, ubicación y entrega
const mine = (await call(chofer, 'GET', '/driver/route')).json;
if (mine.status !== 'PROGRAMADA') {
  console.log('FALLA la ruta de hoy del chofer ya fue iniciada: ejecuta `npm run db:seed` y vuelve a correr la prueba');
  process.exit(1);
}
check('el repartidor recibe coordenadas de las paradas', mine.stops[0].customer.lat !== null);
const early = await call(chofer, 'POST', `/driver/stops/${mine.stops[0].id}/arrive`, { at: localAt(8, 25) });
check('no se registra llegada antes de salir a ruta', early.status === 400, early.json.message);
await call(chofer, 'POST', `/driver/routes/${mine.id}/start`);
const a1 = await call(chofer, 'POST', `/driver/stops/${mine.stops[0].id}/arrive`, { at: localAt(8, 25) });
const a1b = await call(chofer, 'POST', `/driver/stops/${mine.stops[0].id}/arrive`, { at: localAt(9, 0) });
check('llegada a la parada 1 (idempotente: conserva la primera hora)', a1.status === 201 && a1b.json.duplicate === true);
await call(chofer, 'POST', `/driver/stops/${mine.stops[0].id}/deliver`, { clientOpId: 'smoke-r-d1-' + Date.now(), signature: PNG });
await call(chofer, 'POST', `/driver/stops/${mine.stops[1].id}/arrive`, { at: localAt(11, 0) });
await call(chofer, 'POST', `/driver/stops/${mine.stops[1].id}/deliver`, { clientOpId: 'smoke-r-d2-' + Date.now(), signature: PNG });

const t = Date.now();
const pings = [0, 1, 2].map((i) => ({ lat: 20.08 + i * 0.002, lng: -98.36 - i * 0.002, accuracy: 12, at: new Date(t - (3 - i) * 30000).toISOString() }));
const p1 = await call(chofer, 'POST', '/driver/locations', { routeId: mine.id, pings });
const p2 = await call(chofer, 'POST', '/driver/locations', { routeId: mine.id, pings });
check('se guardan 3 ubicaciones y reenviarlas no las duplica', p1.json.saved === 3 && p2.json.saved === 0, `${p1.json.saved} y ${p2.json.saved}`);
check(
  'coordenadas inválidas se rechazan',
  (await call(chofer, 'POST', '/driver/locations', { routeId: mine.id, pings: [{ lat: 123, lng: 0, at: new Date().toISOString() }] })).status === 400,
);
check('un supervisor no puede mandar ubicaciones como repartidor', (await call(sup, 'POST', '/driver/locations', { routeId: mine.id, pings })).status === 403);

// ---- supervisor: detalle, monitoreo y eficiencia
const det = (await call(sup, 'GET', `/routes/${mine.id}`)).json;
check('detalle con horas de llegada y entrega', det.stopsDetail[0].arrivedAt && det.stopsDetail[0].deliveredAt && det.lastPing, `estado ${det.status}`);
check('parada 1: a tiempo (llegó 08:25, estimada 08:30)', det.stopsDetail[0].late === false);
check('parada 2: tardía (llegó 11:00, estimada 09:15)', det.stopsDetail[1].late === true);
const mon = (await call(sup, 'GET', '/routes/monitor')).json;
const mr = mon.routes.find((r) => r.id === mine.id);
check(
  'monitoreo: la ruta en curso trae su última ubicación y recorrido',
  !!mr && Math.abs(mr.lastPing.lat - 20.084) < 1e-9 && mr.trail.length === 3 && mr.stopsMap.length === 5,
  mr ? `${mr.trail.length} puntos` : 'sin ruta',
);
check(
  'monitoreo: paradas con coordenadas',
  mr.stopsMap.every((s) => s.customer.lat !== null),
);
const list = (await call(sup, 'GET', '/routes?scope=today')).json;
check(
  'lista de hoy con indicadores',
  list.routes.some((r) => r.id === mine.id) && list.kpis.inProgress >= 1 && list.kpis.stopsDelivered >= 2,
  JSON.stringify({ enCurso: list.kpis.inProgress, entregadas: list.kpis.stopsDelivered }),
);
const eff = (await call(sup, 'GET', '/routes/efficiency')).json;
check(
  'eficiencia: 7 días, a tiempo vs. tardías y por repartidor',
  eff.perDay.length === 7 &&
    eff.kpis.onTimePct !== null &&
    eff.kpis.late > 0 &&
    eff.perDriver.some((d) => d.name === 'Marco Díaz') &&
    eff.perDriver.some((d) => d.name === 'Luis Gómez'),
  `${eff.kpis.onTimePct} % a tiempo, ${eff.kpis.stops} paradas`,
);
check(
  'eficiencia: tiempo por parada y motivos de no entrega',
  eff.kpis.avgMinutes > 0 && Object.keys(eff.reasons).length >= 1,
  `${eff.kpis.avgMinutes} min · ${JSON.stringify(eff.reasons)}`,
);

console.log(failed ? `\n${failed} verificación(es) fallaron` : '\nTodo correcto');
process.exit(failed ? 1 : 0);
