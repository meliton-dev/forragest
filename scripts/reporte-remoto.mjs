#!/usr/bin/env node
/**
 * Reporte de consumo remoto de Forragest.
 *
 * Demuestra, con pruebas reales y evidencia, que la app móvil consume la API desde un servidor
 * (y no desde la computadora local):
 *   1. el destino de la API: dominio público, DNS, certificado HTTPS
 *   2. el servicio en línea: /health, latencias, base de datos
 *   3. autenticación y lectura de datos con la API publicada
 *   4. la app móvil en un navegador: todas sus peticiones van al servidor, ninguna a un equipo local
 *   5. escritura de extremo a extremo: una entrega hecha en la app (con y sin conexión) llega a la base del servidor
 *
 * Uso:
 *   node scripts/reporte-remoto.mjs --api https://mi-api.onrender.com --app https://mi-app.onrender.com
 * Opciones:
 *   --solo-lectura          no crea rutas ni registra entregas en el servidor
 *   --sup / --sup-pass      usuario supervisor (por omisión supervisor / REPORT_PASSWORD)
 *   --driver / --driver-pass  chofer de prueba (por omisión chofer2 / REPORT_PASSWORD)
 *   --out carpeta           dónde guardar el reporte (por omisión reporte-consumo-remoto)
 *   CHROME_PATH             ruta de Chrome/Edge si no está en un lugar habitual
 */
import { chromium } from 'playwright-core';
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------- argumentos
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const flag = (name) => argv.includes(`--${name}`);
const API = (arg('api', process.env.REPORT_API ?? '')).replace(/\/$/, '');
const APP = (arg('app', process.env.REPORT_APP ?? '')).replace(/\/$/, '');
const PASS = process.env.REPORT_PASSWORD ?? 'cambiar123';
const SUP = { user: arg('sup', 'supervisor'), pass: arg('sup-pass', PASS) };
const DRV = { user: arg('driver', 'chofer2'), pass: arg('driver-pass', PASS) };
const READ_ONLY = flag('solo-lectura');
const OUT = arg('out', 'reporte-consumo-remoto');
if (!API || !APP) {
  console.error('Uso: node scripts/reporte-remoto.mjs --api <URL de la API> --app <URL de la app móvil> [--solo-lectura]');
  process.exit(2);
}

// ---------- utilidades
const checks = [];
const shots = [];
const requests = [];
const check = (section, name, ok, detail = '') => { checks.push({ section, name, ok: !!ok, detail }); console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`); return !!ok; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127); }
  const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
};
async function classify(host) {
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return { local: true, addresses: [], note: 'nombre de equipo local' };
  if (net.isIP(host)) return { local: isPrivateIp(host), addresses: [host], note: isPrivateIp(host) ? 'dirección IP de red privada' : 'dirección IP pública' };
  try {
    const addrs = (await dns.lookup(host, { all: true })).map((a) => a.address);
    const priv = addrs.some(isPrivateIp);
    return { local: priv, addresses: addrs, note: priv ? 'el dominio apunta a una red privada' : 'dominio público' };
  } catch (e) { return { local: false, addresses: [], unresolved: true, note: `no resuelve en DNS (${e.code ?? e.message})` }; }
}
const certInfo = (host, port) => new Promise((resolve) => {
  const s = tls.connect({ host, port, servername: host, timeout: 8000 }, () => {
    const c = s.getPeerCertificate();
    resolve({ ok: s.authorized, protocol: s.getProtocol(), subject: c.subject?.CN, issuer: c.issuer?.O ?? c.issuer?.CN, validTo: c.valid_to, error: s.authorizationError });
    s.end();
  });
  s.on('error', (e) => resolve({ ok: false, error: e.message }));
  s.on('timeout', () => { resolve({ ok: false, error: 'tiempo de espera agotado' }); s.destroy(); });
});
async function http(method, path, { token, body } = {}) {
  const t0 = performance.now();
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* no es JSON */ }
  return { status: res.status, ms: Math.round(performance.now() - t0), headers: res.headers, json };
}
const login = async (u) => (await http('POST', '/auth/login', { body: { username: u.user, password: u.pass } }));
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

const apiUrl = new URL(API);
const appUrl = new URL(APP);
const startedAt = new Date();
console.log(`\nReporte de consumo remoto · API ${API} · App ${APP}\n`);

// ---------- 1. destino
const apiClass = await classify(apiUrl.hostname);
const appClass = await classify(appUrl.hostname);
check('Destino', 'La API no está en un equipo local', !apiClass.local && !apiClass.unresolved, `${apiUrl.hostname} → ${apiClass.addresses.join(', ') || '—'} (${apiClass.note})`);
check('Destino', 'La app móvil se sirve desde un dominio público', !appClass.local && !appClass.unresolved, `${appUrl.hostname} → ${appClass.addresses.join(', ') || '—'} (${appClass.note})`);
const apiTls = apiUrl.protocol === 'https:' ? await certInfo(apiUrl.hostname, Number(apiUrl.port || 443)) : null;
check('Destino', 'La API usa HTTPS con certificado válido', apiTls?.ok, apiTls ? `${apiTls.protocol ?? ''} · emitido a ${apiTls.subject ?? '—'} por ${apiTls.issuer ?? '—'} · vence ${apiTls.validTo ?? '—'}${apiTls.error ? ' · ' + apiTls.error : ''}` : 'usa http (sin cifrado)');

// ---------- 2. servicio
const lat = [];
let health = null; let serverHeader = '';
for (let i = 0; i < 5; i++) {
  try { const r = await http('GET', '/health'); lat.push(r.ms); if (r.status === 200) { health = r.json; serverHeader = r.headers.get('server') ?? r.headers.get('via') ?? r.headers.get('x-render-origin-server') ?? ''; } } catch { /* se cuenta como falla abajo */ }
}
check('Servicio', 'GET /health responde 200 con la base de datos activa', health?.status === 'ok' && health?.db === 'up', health ? `host del servidor: ${health.host} · entorno: ${health.environment} · en línea desde hace ${health.uptimeSeconds} s` : 'sin respuesta');
check('Servicio', 'El servicio corre en modo producción', health?.environment === 'production', `NODE_ENV=${health?.environment ?? '—'}`);
check('Servicio', 'Latencia de la API razonable (mediana < 1500 ms)', lat.length > 0 && median(lat) < 1500, `${lat.length} mediciones: mediana ${median(lat)} ms · mín ${Math.min(...lat, Infinity)} · máx ${Math.max(...lat, 0)}`);
const unauth = await http('GET', '/driver/route').catch(() => ({ status: 0 }));
check('Servicio', 'Las rutas privadas exigen sesión (401 sin token)', unauth.status === 401, `respuesta ${unauth.status}`);

// ---------- 3. autenticación y datos
const supLogin = await login(SUP).catch(() => ({ status: 0 }));
const supTok = supLogin.json?.accessToken;
check('Autenticación y datos', 'Inicio de sesión del supervisor contra la API publicada', !!supTok, `POST /auth/login → ${supLogin.status} en ${supLogin.ms ?? '—'} ms`);
const opt = supTok ? (await http('GET', '/routes/options', { token: supTok })).json : null;
check('Autenticación y datos', 'La API devuelve catálogos desde su base de datos (choferes, camiones, clientes, productos)', opt?.drivers?.length && opt?.customers?.length && opt?.catalog?.length, opt ? `${opt.drivers?.length ?? 0} choferes · ${opt.vehicles?.length ?? 0} camiones · ${opt.customers?.length ?? 0} clientes · ${opt.catalog?.length ?? 0} presentaciones` : 'sin datos');

// ---------- 4 y 5. app móvil en navegador
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean).find((p) => existsSync(p));
let routeId = null; let writeRan = false;
if (!CHROME) {
  check('App móvil', 'Navegador disponible para la prueba', false, 'No se encontró Chrome/Edge. Define CHROME_PATH con la ruta del ejecutable.');
} else {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const pending = new Map();
  page.on('request', (r) => { if (['fetch', 'xhr'].includes(r.resourceType())) pending.set(r, performance.now()); });
  const finish = (r, status, error) => { const t0 = pending.get(r); if (t0 === undefined) return; pending.delete(r); const u = new URL(r.url()); requests.push({ method: r.method(), host: u.host, hostname: u.hostname, path: u.pathname, status, error, ms: Math.round(performance.now() - t0) }); };
  page.on('requestfinished', async (r) => { const res = await r.response().catch(() => null); finish(r, res?.status() ?? 0); });
  page.on('requestfailed', (r) => finish(r, 0, r.failure()?.errorText));
  const shot = async (title) => { shots.push({ title, data: (await page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64') }); };

  try {
    // crea una ruta de prueba (si se permite escribir) para que el chofer tenga algo que entregar
    if (!READ_ONLY && supTok && opt) {
      const driver = opt.drivers.find((d) => d.username === DRV.user);
      const prod = opt.catalog.find((c) => c.code === 'AV-001' && c.presentation === 'Saco 40 kg') ?? opt.catalog[0];
      const [c1, c2] = [opt.customers.find((c) => c.name === 'Rancho San Miguel') ?? opt.customers[0], opt.customers.find((c) => c.name === 'Establo Los Pinos') ?? opt.customers[1]];
      const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (driver && prod && c1 && c2) {
        const mk = await http('POST', '/routes', { token: supTok, body: { name: 'Ruta Reporte remoto (e2e)', date: today, driverId: driver.id, vehicleId: opt.vehicles[0].id, plannedDeparture: '07:50', stops: [
          { customerId: c1.id, eta: '08:30', paymentTerms: 'CONTADO', items: [{ productId: prod.productId, presentationId: prod.presentationId, quantity: 1 }] },
          { customerId: c2.id, eta: '09:00', items: [{ productId: prod.productId, presentationId: prod.presentationId, quantity: 1 }] }] } });
        if (mk.status === 201) routeId = mk.json.id; else console.log('  (no se pudo crear la ruta de prueba:', mk.status, mk.json?.message, ')');
      } else console.log(`  (no existe el chofer "${DRV.user}" o faltan datos de catálogo: se hace solo lectura)`);
    }
    const stopStatuses = async () => { const r = await http('GET', `/routes/${routeId}`, { token: supTok }); return { status: r.json?.status, stops: (r.json?.stopsDetail ?? []).map((s) => s.status) }; };
    const waitStop = async (i, want, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await stopStatuses()).stops[i] === want) return Date.now() - t0; await sleep(1500); } return null; };

    // --- iniciar sesión en la app
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByPlaceholder('ej. mdiaz').fill(DRV.user);
    await page.getByPlaceholder('••••••••').fill(DRV.pass);
    await shot('Pantalla de inicio de sesión de la app móvil');
    await page.getByRole('button', { name: 'Entrar' }).click();
    const tour = page.getByRole('dialog', { name: 'Tutorial de bienvenida' });
    await tour.waitFor({ timeout: 8000 }).then(() => page.getByRole('button', { name: 'Omitir' }).click()).catch(() => {});
    await page.waitForResponse((r) => r.url().includes('/driver/route'), { timeout: 20000 }).catch(() => {});
    await sleep(1500);
    await shot('Ruta del día cargada desde la API');

    const apiReq = requests.filter((r) => r.path !== '/' && !/\.(js|css|png|svg|ico|woff2?|webmanifest)$/.test(r.path));
    const loginReq = apiReq.find((r) => r.path.endsWith('/auth/login'));
    check('App móvil', 'La app inició sesión contra la API del servidor', loginReq && loginReq.status >= 200 && loginReq.status < 300, loginReq ? `${loginReq.method} ${loginReq.host}${loginReq.path} → ${loginReq.status} en ${loginReq.ms} ms` : 'no se vio la petición de login');
    const routeReq = apiReq.find((r) => r.path.endsWith('/driver/route'));
    check('App móvil', 'La app descargó la ruta del día desde la API', routeReq && routeReq.status >= 200 && routeReq.status < 300, routeReq ? `${routeReq.method} ${routeReq.host}${routeReq.path} → ${routeReq.status} en ${routeReq.ms} ms` : 'no se vio GET /driver/route');
    const hosts = [...new Set(apiReq.map((r) => r.hostname))];
    const localHits = [];
    for (const h of hosts) if ((await classify(h)).local) localHits.push(h);
    check('App móvil', 'Ninguna petición de la app va a un equipo local', apiReq.length > 0 && localHits.length === 0, `${apiReq.length} peticiones a: ${hosts.join(', ') || '—'}${localHits.length ? ' · LOCAL: ' + localHits.join(', ') : ''}`);
    check('App móvil', 'Las peticiones de datos van al dominio de la API configurada', apiReq.length > 0 && apiReq.every((r) => r.hostname === apiUrl.hostname), `API esperada: ${apiUrl.hostname}`);

    // --- escritura de extremo a extremo
    if (routeId) {
      writeRan = true;
      await page.getByText('Carga tu camión para salir').click();
      await page.locator('.checkbox').first().waitFor();
      for (const c of await page.locator('.checkbox').all()) await c.click();
      await page.getByRole('button', { name: 'Confirmar carga y salir' }).click();
      await page.getByRole('dialog', { name: 'Compartir ubicación' }).waitFor({ timeout: 8000 }).then(() => page.getByRole('button', { name: 'Ahora no' }).click()).catch(() => {});
      await page.getByText('Siguiente parada').first().waitFor({ timeout: 20000 });
      const st = await stopStatuses();
      check('Escritura de extremo a extremo', 'Salir a ruta en la app cambió el estado de la ruta en la base del servidor', st.status === 'EN_CURSO', `estado en el servidor: ${st.status}`);

      const deliver = async () => {
        await page.getByRole('link', { name: /Entregar/ }).first().click();
        await page.getByRole('button', { name: 'Llegué · Entregar' }).click();
        await page.getByText('Firma del cliente', { exact: true }).waitFor();
        const box = await page.locator('.sig canvas').boundingBox();
        await page.mouse.move(box.x + 30, box.y + 40); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + 70, { steps: 6 }); await page.mouse.up();
        await page.getByRole('button', { name: 'Confirmar entrega' }).click();
      };
      await deliver();
      const t1 = await waitStop(0, 'ENTREGADA', 40000);
      await shot('Entrega 1 registrada con conexión');
      check('Escritura de extremo a extremo', 'Una entrega hecha en la app aparece en la base del servidor', t1 !== null, t1 !== null ? `llegó al servidor ${(t1 / 1000).toFixed(1)} s después de confirmar (incluye los 8 s de margen para deshacer)` : 'no llegó en 40 s');

      await sleep(6000); // una persona no pierde la señal en el mismo instante en que llega la respuesta: se deja asentar el envío
      await ctx.setOffline(true);
      await deliver();
      await sleep(10000);
      await shot('Entrega 2 registrada SIN conexión (queda guardada en el teléfono)');
      const mid = await stopStatuses();
      check('Escritura de extremo a extremo', 'Sin conexión la entrega NO llega al servidor y queda guardada en el teléfono', mid.stops[1] === 'PENDIENTE', `parada 2 en el servidor: ${mid.stops[1]}`);
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      const t2 = await waitStop(1, 'ENTREGADA', 60000);
      await shot('Al volver la conexión la app sincroniza con el servidor');
      check('Escritura de extremo a extremo', 'Al volver la conexión la app sincroniza sola con el servidor', t2 !== null, t2 !== null ? `sincronizada ${(t2 / 1000).toFixed(1)} s después de recuperar la señal` : 'no sincronizó en 60 s');

      await page.goto(APP + '/cierre').catch(() => {});
      await page.getByRole('button', { name: /Registrar regreso/ }).click({ timeout: 8000 }).catch(() => {});
      await sleep(10000);
      const fin = await stopStatuses();
      check('Escritura de extremo a extremo', 'El cierre de ruta hecho en la app quedó registrado en el servidor', fin.status === 'FINALIZADA', `estado final en el servidor: ${fin.status}`);
    } else if (!READ_ONLY) {
      check('Escritura de extremo a extremo', 'Prueba de escritura', false, 'no se pudo preparar la ruta de prueba (revisa usuario supervisor y chofer)');
    }
  } catch (e) {
    check('App móvil', 'La prueba en el navegador terminó sin errores', false, String(e.message ?? e).split('\n')[0]);
    try { await shot('Estado al ocurrir el error'); } catch { /* sin captura */ }
  } finally {
    await browser.close();
  }
}

// ---------- veredicto y reporte
const remote = !apiClass.local && !apiClass.unresolved && checks.every((c) => c.ok);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sections = [...new Set(checks.map((c) => c.section))];
const apiReqs = requests.filter((r) => !/\.(js|css|png|svg|ico|woff2?|webmanifest)$/.test(r.path));
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forragest · Reporte de consumo remoto</title>
<style>
:root{--ink:#161922;--muted:#5b5f6d;--line:#e8e4d8;--bg:#f6f3ea;--ok:#1d7a46;--okbg:#e4f3ea;--bad:#b3261e;--badbg:#fbe7e5;--blue:#0b5fe0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 20px 64px}h1{font-size:28px;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:18px;margin:36px 0 12px}
.sub{color:var(--muted);margin:0 0 24px}.verdict{border-radius:18px;padding:20px 22px;margin:20px 0;border:1px solid}.verdict.ok{background:var(--okbg);border-color:#b7dcc6}.verdict.bad{background:var(--badbg);border-color:#efbcb7}
.verdict b{font-size:20px;display:block;margin-bottom:4px}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:6px 18px}
.row{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}.row:last-child{border:0}.mark{font-weight:700}.mark.ok{color:var(--ok)}.mark.bad{color:var(--bad)}.det{color:var(--muted);font-size:13px;word-break:break-word}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);word-break:break-all}th{color:var(--muted);font-weight:600}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:16px;padding:10px}figure img{width:100%;border-radius:10px;display:block}figcaption{font-size:12.5px;color:var(--muted);margin-top:8px}
.flow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:600}.flow span{background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px 12px}.flow i{color:var(--blue);font-style:normal}
code{background:#fff;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:13px}footer{color:var(--muted);font-size:12.5px;margin-top:40px}
@media print{body{background:#fff}.card,figure{break-inside:avoid}}
</style></head><body><main>
<h1>Forragest · Reporte de consumo remoto</h1>
<p class="sub">Generado el ${esc(startedAt.toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' }))} · API <code>${esc(API)}</code> · App móvil <code>${esc(APP)}</code></p>
<div class="verdict ${remote ? 'ok' : 'bad'}"><b>${remote ? 'La app móvil consume los datos de una API alojada en un servidor remoto.' : 'No se pudo demostrar el consumo remoto.'}</b>${remote ? `Todas las pruebas pasaron (${checks.length}/${checks.length}). La API responde desde <code>${esc(apiUrl.hostname)}</code> (${esc(apiClass.addresses.join(', '))}), no desde un equipo local.` : `${checks.filter((c) => !c.ok).length} de ${checks.length} comprobaciones fallaron. Revisa los puntos marcados abajo.`}</div>
<h2>Arquitectura probada</h2>
<div class="flow"><span>Celular · app Forragest</span><i>→ HTTPS →</i><span>Servidor · API (${esc(apiUrl.hostname)})</span><i>→</i><span>Base de datos PostgreSQL</span></div>
${sections.map((s) => `<h2>${esc(s)}</h2><div class="card">${checks.filter((c) => c.section === s).map((c) => `<div class="row"><span class="mark ${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'}</span><div><div>${esc(c.name)}</div>${c.detail ? `<div class="det">${esc(c.detail)}</div>` : ''}</div></div>`).join('')}</div>`).join('')}
${apiReqs.length ? `<h2>Peticiones que hizo la app (registro de red)</h2><div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>Método</th><th>Servidor</th><th>Ruta</th><th>Estado</th><th>Tiempo</th></tr></thead><tbody>${apiReqs.map((r) => `<tr><td>${esc(r.method)}</td><td>${esc(r.host)}</td><td>${esc(r.path)}</td><td>${r.status}${r.error ? ` (${esc(r.error)})` : ''}</td><td>${r.ms} ms</td></tr>`).join('')}</tbody></table></div>` : ''}
${shots.length ? `<h2>Capturas de la app durante la prueba</h2><div class="shots">${shots.map((s) => `<figure><img alt="${esc(s.title)}" src="data:image/jpeg;base64,${s.data}"><figcaption>${esc(s.title)}</figcaption></figure>`).join('')}</div>` : ''}
<h2>Cómo comprobarlo por cuenta propia</h2>
<div class="card"><div class="row"><span class="mark">1</span><div>Abre la app en tu celular con <code>${esc(APP)}</code> (sin conectarte a la red de la computadora donde se desarrolla).</div></div>
<div class="row"><span class="mark">2</span><div>En una computadora, abre la misma dirección, pulsa <code>F12</code> › pestaña <b>Red</b> y observa que las peticiones <code>login</code>, <code>route</code> y <code>deliver</code> van a <code>${esc(apiUrl.host)}</code>.</div></div>
<div class="row"><span class="mark">3</span><div>Apaga la computadora de desarrollo: la app debe seguir funcionando, porque la API vive en el servidor.</div></div>
<div class="row"><span class="mark">4</span><div>Abre <code>${esc(API)}/health</code> en cualquier navegador: muestra el estado del servicio y de la base de datos.</div></div></div>
${writeRan ? '<footer>La prueba de escritura creó la ruta "Ruta Reporte remoto (e2e)" en el servidor y la cerró; se puede identificar por ese nombre.</footer>' : '<footer>Se ejecutó en modo solo lectura: no se crearon ni modificaron datos en el servidor.</footer>'}
</main></body></html>`;
const dir = join(OUT, startedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-'));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'reporte.html'), html);
writeFileSync(join(dir, 'evidencia.json'), JSON.stringify({ api: API, app: APP, generado: startedAt.toISOString(), veredictoRemoto: remote, destino: { api: apiClass, app: appClass }, comprobaciones: checks, peticiones: apiReqs }, null, 2));
console.log(`\n${remote ? 'VEREDICTO: consumo remoto demostrado' : 'VEREDICTO: NO demostrado'} · ${checks.filter((c) => c.ok).length}/${checks.length} comprobaciones`);
console.log(`Reporte: ${join(dir, 'reporte.html')}`);
process.exit(remote ? 0 : 1);
