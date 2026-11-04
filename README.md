# Sistema de Gestión Integral para Forrajera

Monorepo: API (NestJS + Prisma + PostgreSQL) y app móvil del repartidor (PWA con React + Vite).

| Carpeta | Qué es |
|---|---|
| `apps/api` | API REST: autenticación con roles, inventario con PEPS y rutas/entregas del repartidor |
| `apps/driver` | App móvil del repartidor (PWA instalable, funciona sin conexión) |

## Primer arranque

Requisitos: Node 22, Docker Desktop.

```bash
npm install
docker compose up -d db              # PostgreSQL
npm run prisma:migrate -w apps/api   # crea las tablas (usa apps/api/.env)
npm run db:seed                      # usuarios, productos, stock y la ruta de demostración de hoy
```

Cuentas de demostración (contraseña `cambiar123`): `admin`, `cajero`, `almacen`, `chofer`, `compras`, `supervisor`.
Para usar otra contraseña: `SEED_PASSWORD=MiClaveSegura npm run db:seed`.

`npm run db:seed` también **reinicia la ruta de demostración del chofer** (5 paradas, hoy) para volver a probar.

## Correr la API y la app

```bash
npm run api:dev          # http://localhost:3000
npm run driver:build && npm run driver:preview   # app en http://localhost:4173 (con service worker)
# o, para desarrollar con recarga en caliente:
npm run driver:dev       # http://localhost:5173
```

La app habla solo con su propio servidor: `/api` se reenvía a la API (`API_URL`, por defecto `http://localhost:3000`).
Por eso basta exponer **un solo puerto** para probar en el celular y no hay problemas de CORS.

## Probarla en el celular

1. **Misma red Wi‑Fi (rápido, sin instalar):** abre `http://<IP-de-tu-PC>:4173` en el celular
   (`ipconfig` → dirección IPv4). Si Windows pregunta por el firewall, permite redes privadas.
   Funciona como página web, pero **sin HTTPS el navegador no permite instalarla ni usar el modo sin conexión**.
2. **Instalable y sin conexión (requiere HTTPS):** expón el puerto 4173 con un túnel HTTPS, por ejemplo
   [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
   (`cloudflared tunnel --url http://localhost:4173`) y abre la dirección `https://…` que te da.
   - **Antes, cambia las contraseñas de demostración** (`SEED_PASSWORD=… npm run db:seed`): el túnel es público.
   - **Android (Chrome):** menú ⋮ → *Instalar aplicación*, o el botón en *Perfil*.
   - **iPhone (Safari):** *Compartir* → *Agregar a pantalla de inicio*.

Inicia sesión con `chofer`. Flujo: **Cargar camión** (necesita conexión) → entregar paradas con firma o foto y cobro
→ **Cerrar ruta**. Después de cargar el camión puedes activar el modo avión: todo se guarda en el teléfono y se envía
solo al volver la conexión (pantalla *Perfil → Sincronización*).

## Pruebas

```bash
npm run driver:test      # lógica de la cola sin conexión y del resumen (vitest)
npm run db:seed && npm run api:smoke   # flujo completo del repartidor contra la API en marcha (20 verificaciones)
```
