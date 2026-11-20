// `npm run db:reset`: borra TODA la base y la carga limpia. Solo se permite sobre una base local.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { loadEnv, databaseHost, isLocalDatabaseUrl } = createRequire(import.meta.url)('../apps/api/prisma/db-guard.js');

loadEnv();
if (!isLocalDatabaseUrl(process.env.DATABASE_URL)) {
  const host = databaseHost(process.env.DATABASE_URL);
  console.error(
    `db:reset cancelado: borra TODA la base y solo se permite en una base local (localhost). ` +
      (host ? `DATABASE_URL apunta a "${host}".` : 'DATABASE_URL falta o no se puede leer.') +
      ` No se tocó nada.`,
  );
  process.exit(1);
}

const run = (args) => spawnSync('npm', args, { stdio: 'inherit', shell: true });
for (const args of [
  ['exec', '-w', 'apps/api', '--', 'prisma', 'migrate', 'reset', '--force', '--skip-seed'],
  ['run', 'db:seed'],
]) {
  const r = run(args);
  if (r.status !== 0) process.exit(r.status ?? 1);
}
