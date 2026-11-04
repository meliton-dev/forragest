# API de Forragest. Se construye desde la raíz del repositorio:
#   docker build -f apps/api/Dockerfile -t forragest-api .
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
# se instalan también las dependencias de desarrollo: hacen falta para compilar y para el seed inicial
RUN npm ci --workspace=apps/api --include-workspace-root --include=dev
RUN npx prisma generate --schema apps/api/prisma/schema.prisma && npm run build -w apps/api
EXPOSE 3000
# aplica las migraciones pendientes y arranca; el hosting define PORT, DATABASE_URL y JWT_SECRET
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/src/main.js"]
