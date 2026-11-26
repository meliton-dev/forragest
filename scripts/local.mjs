// Copia local completa de Forragest: base de datos, API, punto de venta/oficina y app del chofer.
//
//   npm run local              arranca todo (Ctrl+C para detener)
//   npm run local:reiniciar    borra la base local y la vuelve a cargar con la forrajera simulada
//   npm run local:detener      apaga la base de datos (Docker)
//
// Solo trabaja con una base en esta computadora (localhost): nunca toca producción.
// Por defecto no usa servicios de internet para las rutas (se dibujan en línea recta); con `npm run local -- --calles`
// usa el servicio público de rutas por calles. Ver LOCAL.md.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_ENV = path.join(ROOT, 'apps', 'api', '.env');
const { isLocalDatabaseUrl, databaseHost } = createRequire(import.meta.url)('../apps/api/prisma/db-guard.js');

const LOCAL_DB = 'postgresql://forrajera:forrajera@localhost:5432/forrajera';
const PORTS = { api: 3000, web: 5174, driver: 5173 };
const isWin = process.platform === 'win32';

const say = (msg = '') => console.log(msg);
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });
const quiet = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'pipe', shell: true, encoding: 'utf8', ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Las dependencias deben estar instaladas y los paquetes del proyecto (node_modules/@forrajera/*) deben apuntar a
 * ESTA carpeta. Si el proyecto se movió o se copió a otro lugar, apuntan a la carpeta vieja y nada compila:
 * `npm install` los vuelve a enlazar.
 */
function ensureDependencies() {
  const links = { api: 'apps/api', web: 'apps/web', driver: 'apps/driver', shared: 'packages/shared' };
  const real = (p) => {
    try {
      return realpathSync(p).toLowerCase();
    } catch {
      return null;
    }
  };
  const broken = Object.entries(links).filter(([name, dir]) => real(path.join(ROOT, 'node_modules', '@forrajera', name)) !== real(path.join(ROOT, dir)));
  if (!existsSync(path.join(ROOT, 'node_modules', '.bin')) || broken.length) {
    say('· Instalando dependencias (la primera vez, o si el proyecto cambió de carpeta; tarda unos minutos)...');
    if (run('npm', ['install']).status !== 0) fail('Falló "npm install". Revisa tu conexión a internet y vuelve a intentar.');
  }
}

/** Lee apps/api/.env (sin tocar process.env). */
function readEnvFile() {
  if (!existsSync(API_ENV)) return {};
  const out = {};
  for (const line of readFileSync(API_ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Crea apps/api/.env la primera vez, con la base local y un secreto aleatorio. */
function ensureApiEnv() {
  if (existsSync(API_ENV)) return;
  const secret = randomBytes(32).toString('hex');
  writeFileSync(
    API_ENV,
    [
      '# Creado por `npm run local` para la copia local. No se sube al repositorio.',
      `DATABASE_URL="${LOCAL_DB}"`,
      `JWT_SECRET=${secret}`,
      'PORT=3000',
      'LOG_LEVEL=info',
      '',
    ].join('\n'),
  );
  say('· Se creó apps/api/.env para la copia local.');
}

/** La base que usaría la API: la variable de la terminal manda sobre el archivo. */
function databaseUrl() {
  return process.env.DATABASE_URL ?? readEnvFile().DATABASE_URL;
}

function assertLocalDatabase() {
  const url = databaseUrl();
  if (!isLocalDatabaseUrl(url)) {
    const host = databaseHost(url);
    fail(
      `La copia local solo trabaja con una base en esta computadora, y DATABASE_URL apunta a ${host ? `"${host}"` : 'una dirección que no se puede leer'}.\n` +
        '  Si abriste esta terminal después de cargar datos en Render, ciérrala y abre una nueva.\n' +
        `  Si no, revisa apps/api/.env (debe decir ${LOCAL_DB}).`,
    );
  }
}

function assertDocker() {
  const r = quiet('docker', ['info']);
  if (r.status !== 0) fail('Docker no está encendido. Abre "Docker Desktop", espera a que diga que está listo (ballena quieta) y vuelve a correr el comando.');
}

async function startDatabase() {
  say('· Encendiendo la base de datos (Docker)...');
  if (run('docker', ['compose', 'up', '-d', 'db']).status !== 0) fail('No se pudo encender la base de datos con Docker.');
  for (let i = 0; i < 60; i++) {
    if (quiet('docker', ['compose', 'exec', '-T', 'db', 'pg_isready', '-U', 'forrajera']).status === 0) return;
    await sleep(1000);
  }
  fail('La base de datos no respondió en 60 s. Abre Docker Desktop y revisa el contenedor "db".');
}

function migrate() {
  say('· Preparando las tablas (migraciones)...');
  if (run('npm', ['exec', '-w', 'apps/api', '--', 'prisma', 'migrate', 'deploy']).status !== 0) fail('Fallaron las migraciones de la base.');
}

function seed() {
  say('· Cargando y poniendo al día la forrajera simulada (ventas, compras, rutas de hoy)...');
  if (run('npm', ['run', 'db:seed'], { env: { ...process.env, SEED_KEEP_TODAY: '1' } }).status !== 0) fail('Falló la carga de datos de demostración.');
}

const portBusy = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

async function assertPortsFree() {
  for (const [name, port] of Object.entries(PORTS))
    if (await portBusy(port))
      fail(
        `El puerto ${port} (${name}) ya está ocupado. Probablemente Forragest ya está corriendo en otra ventana:\n` +
          '  ciérrala con Ctrl+C, o reinicia la computadora, y vuelve a intentar.',
      );
}

const children = [];
function startServer(label, color, script, env = {}) {
  const child = spawn('npm', ['run', script], { cwd: ROOT, shell: true, env: { ...process.env, ...env, FORCE_COLOR: '1' } });
  const prefix = `\x1b[${color}m[${label}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) if (l.trim()) out.write(prefix + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n✖ ${label} se detuvo (código ${code}). Se apaga todo; revisa los mensajes de arriba.`);
      stopAll(1);
    }
  });
  children.push(child);
}

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  say('\nDeteniendo Forragest...');
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (isWin) spawnSync('taskkill', ['/pid', String(c.pid), '/t', '/f'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  say('Listo. La base de datos sigue encendida en Docker (se apaga con: npm run local:detener).');
  process.exit(code);
}

async function waitFor(url, seconds) {
  for (let i = 0; i < seconds; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* todavía no */
    }
    await sleep(1000);
  }
  return false;
}

async function arrancar(args) {
  const calles = args.includes('--calles');
  say('\nForragest · copia local\n');
  ensureDependencies();
  ensureApiEnv();
  assertLocalDatabase();
  assertDocker();
  await assertPortsFree();
  await startDatabase();
  migrate();
  seed();

  say('\n· Arrancando la API, el punto de venta/oficina y la app del chofer...');
  // ROUTING_URL vacío = sin servicio externo de rutas (líneas rectas); con --calles se usa el público.
  startServer('api', '36', 'api:dev', calles ? {} : { ROUTING_URL: '' });
  startServer('web', '35', 'web:dev');
  startServer('chofer', '33', 'driver:dev');
  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));

  const ok =
    (await waitFor(`http://localhost:${PORTS.api}/health`, 180)) &&
    (await waitFor(`http://localhost:${PORTS.web}/`, 60)) &&
    (await waitFor(`http://localhost:${PORTS.driver}/`, 60));
  if (!ok) {
    console.error('\n✖ Algo no arrancó a tiempo; revisa los mensajes de arriba.');
    return stopAll(1);
  }
  say(
    [
      '',
      '\x1b[32m✔ Forragest está listo en esta computadora\x1b[0m',
      '',
      `  Punto de venta y oficina:  http://localhost:${PORTS.web}`,
      `  App del chofer:            http://localhost:${PORTS.driver}`,
      `  API (estado):              http://localhost:${PORTS.api}/health`,
      '',
      '  Usuarios: admin, cajero, cajero2, supervisor, compras, almacen, chofer, chofer2, chofer3',
      '  Contraseña local de todos: la de README.md (solo para esta copia).',
      calles
        ? '  Rutas por calles: servicio público (necesita internet).'
        : '  Rutas: en línea recta (sin servicio de internet). Para calles: npm run local -- --calles',
      '',
      '  Para detener: Ctrl+C en esta ventana.',
      '',
    ].join('\n'),
  );
}

async function reiniciar(args) {
  ensureDependencies();
  ensureApiEnv();
  assertLocalDatabase();
  assertDocker();
  if (!args.includes('--si')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question('Esto BORRA todo lo que hiciste en la copia local y la vuelve a cargar limpia. Escribe SI para continuar: ');
    rl.close();
    if (a.trim().toUpperCase() !== 'SI') return say('Cancelado. No se borró nada.');
  }
  await startDatabase();
  say('· Borrando y recargando la base local...');
  if (run('npm', ['run', 'db:reset']).status !== 0) fail('No se pudo reiniciar la base local.');
  say('\n✔ La copia local quedó limpia. Arráncala con: npm run local');
}

function detener() {
  assertDocker();
  run('docker', ['compose', 'stop', 'db']);
  say('✔ Base de datos apagada. Los datos se conservan; se vuelve a encender con: npm run local');
}

const [cmd = 'arrancar', ...rest] = process.argv.slice(2);
const actions = { arrancar, reiniciar, detener };
if (!actions[cmd]) fail(`No conozco "${cmd}". Usa: arrancar, reiniciar o detener.`);
await actions[cmd](rest);
