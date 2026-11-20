#!/bin/sh
# Arranque de la API en el contenedor (Render). Se ejecuta desde /app.
set -e

# 1. Migraciones pendientes
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

# 2. Datos de demostración (la forrajera simulada), solo si SEED_ON_BOOT=1.
#    El seed completa los días que falten y rehace la ruta de hoy si no ha salido, así la demostración
#    siempre tiene "hoy". Usa SEED_PASSWORD para los usuarios nuevos y no cambia los existentes.
#    Si falla o tarda demasiado, la API arranca igual (el error queda en los logs).
if [ "$SEED_ON_BOOT" = "1" ]; then
  echo "Cargando datos de demostración (SEED_ON_BOOT=1)..."
  if (cd apps/api && SEED_ALLOW_REMOTE=1 TS_NODE_TRANSPILE_ONLY=1 timeout 300 npx ts-node prisma/seed.ts); then
    echo "Datos de demostración listos."
  else
    echo "Aviso: la carga de datos de demostración falló; la API arranca igual."
  fi
fi

# 3. API
exec node apps/api/dist/src/main.js
