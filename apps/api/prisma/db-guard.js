/* eslint-disable no-undef, @typescript-eslint/no-require-imports -- módulo CommonJS a propósito: lo cargan seed.ts (ts-node) y scripts/db-reset.mjs */
// Protección contra bases remotas. Lo usan el seed (seed.ts) y `npm run db:reset` (scripts/db-reset.mjs).
// Es JavaScript plano (con db-guard.d.ts para los tipos) para que lo pueda cargar Node sin compilar.
const path = require('node:path');
const { URL } = require('node:url');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** Carga los .env locales (apps/api/.env y el de la raíz) sin pisar variables ya definidas. */
function loadEnv() {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
}

/** Solo el host de la URL (nunca usuario ni contraseña). null si falta o no se puede leer. */
function databaseHost(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^\[|\]$/g, '') || null;
  } catch {
    return null;
  }
}

/** true solo si la base está en esta misma computadora. Si no se puede leer el host, se considera remota. */
function isLocalDatabaseUrl(url) {
  const host = databaseHost(url);
  return host !== null && LOCAL_HOSTS.has(host);
}

module.exports = { loadEnv, databaseHost, isLocalDatabaseUrl };
