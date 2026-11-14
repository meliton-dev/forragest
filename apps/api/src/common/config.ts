/** Orígenes permitidos por CORS a partir de CORS_ORIGINS (separados por coma). */
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * En producción no se arranca con una configuración que deje la API insegura:
 * secreto ausente o débil, sin base de datos, o CORS sin orígenes (aceptaría cualquier sitio).
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const secret = env.JWT_SECRET ?? '';
  if (secret.length < 24 || /cambia|secret|changeme/i.test(secret)) {
    throw new Error('JWT_SECRET debe definirse con al menos 24 caracteres aleatorios en producción.');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL no está definida.');
  const origins = parseCorsOrigins(env.CORS_ORIGINS);
  if (!origins.length) throw new Error('CORS_ORIGINS debe listar las direcciones de las apps (separadas por coma) en producción.');
  const bad = origins.find((o) => !/^https?:\/\/[^\s/*]+$/i.test(o));
  if (bad) throw new Error(`CORS_ORIGINS tiene un origen inválido: "${bad}". Usa direcciones completas como https://app.ejemplo.com (sin comodines ni rutas).`);
}
