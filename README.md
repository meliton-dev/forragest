# Forragest · Sistema de Gestión Integral para Forrajera

Monorepo: API (NestJS + Prisma + PostgreSQL) y app móvil del repartidor (PWA con React + Vite).

| Carpeta           | Qué es                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | API REST: autenticación con roles, inventario con PEPS y rutas/entregas del repartidor                                  |
| `apps/driver`     | App móvil del repartidor (PWA instalable, funciona sin conexión)                                                        |
| `apps/web`        | Punto de venta táctil (React + Vite): ventas, descuentos autorizados, devoluciones, corte de caja y tickets de 58/80 mm |
| `packages/shared` | Estados, etiquetas y errores que comparten la API y las apps                                                            |

> **Publicar en un servidor y generar el reporte de consumo remoto:** ver [DEPLOY.md](DEPLOY.md).

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

## Punto de venta (web)

```bash
npm run web:dev          # http://localhost:5174  (o: npm run web:build && npm run web:preview → :4174)
```

Entra con `cajero` / `cambiar123`. Flujo: **abrir turno** (fondo de caja) → vender (efectivo, transferencia, tarjeta o crédito)
→ ticket imprimible de 58 u 80 mm → **corte de caja** al final del turno.

- **Descuentos y cancelaciones** piden usuario y contraseña de un supervisor (`supervisor` / `cambiar123`) y quedan en la bitácora.
- **Crédito:** se bloquea si el cliente tiene saldo vencido o excede su límite. En los datos de demostración, _Borregos La Loma_ está bloqueado.
- **Devoluciones:** busca la venta por folio; genera nota de crédito, regresa el producto al inventario y prorratea el descuento.
- **Imprimir:** el botón usa la impresión del navegador (elige tu impresora térmica); el ticket sale con el ancho del papel elegido.

## Rutas de reparto (supervisor)

Entra a la misma app web (`npm run web:dev`) con `supervisor` / `cambiar123`; te lleva directo a **Rutas**. El administrador ve también el punto de venta.

- **Rutas de reparto:** lista del día con indicadores y detalle de cada parada (hora estimada, llegada, entrega, cobros, incidencias).
- **Nueva ruta:** elige repartidor, camión, paradas (en orden), productos y forma de pago de cada una; la vista previa traza la ruta en el mapa y avisa si falta existencia para cargar.
- **Monitoreo en vivo:** mapa con el camión de cada ruta en curso, su recorrido y el estado de cada parada; avisa “Sin señal” si el repartidor lleva más de 3 minutos sin reportar.
- **Eficiencia:** entregas a tiempo vs. tardías (tardía = más de 15 min sobre la hora estimada), tiempo por parada, cobros y motivos de no entrega, por repartidor y por día.

El mapa usa OpenStreetMap, así que necesita internet. Las rutas se dibujan **por las calles** (no en línea recta): la API pide el trayecto al servicio público OSRM (`POST /routes/path`, con caché de 24 h y respaldo a línea recta si no responde). Ese servicio recibe las coordenadas de las paradas; para usar otro o desactivarlo, define `ROUTING_URL` (vacío = solo líneas rectas). La app del repartidor manda su ubicación cada 10 s **solo mientras la ruta está en curso, la app está abierta y el chofer activó "Compartir ubicación"**; mantiene la pantalla encendida mientras comparte (con la pantalla apagada el navegador deja de dar GPS) y guarda las ubicaciones si no hay señal. El mapa del supervisor se refresca cada 5 s con `GET /routes/live` (ligero), muestra la velocidad y el último dato de cada camión, y pide el detalle completo cada 30 s. Las ubicaciones de más de 45 días se borran solas (`PING_RETENTION_DAYS`). El GPS del navegador **solo funciona con HTTPS** (ver más abajo el túnel).

## Probarla en el celular

1. **Misma red Wi‑Fi (rápido, sin instalar):** abre `http://<IP-de-tu-PC>:4173` en el celular
   (`ipconfig` → dirección IPv4). Si Windows pregunta por el firewall, permite redes privadas.
   Funciona como página web, pero **sin HTTPS el navegador no permite instalarla ni usar el modo sin conexión**.
2. **Instalable y sin conexión (requiere HTTPS):** expón el puerto 4173 con un túnel HTTPS, por ejemplo
   [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
   (`cloudflared tunnel --url http://localhost:4173`) y abre la dirección `https://…` que te da.
   - **Antes, cambia las contraseñas de demostración** (`SEED_PASSWORD=… npm run db:seed`): el túnel es público.
   - **Android (Chrome):** menú ⋮ → _Instalar aplicación_, o el botón en _Perfil_.
   - **iPhone (Safari):** _Compartir_ → _Agregar a pantalla de inicio_.

Inicia sesión con `chofer`. Flujo: **Cargar camión** (necesita conexión) → entregar paradas con firma o foto y cobro
→ **Cerrar ruta**. Después de cargar el camión puedes activar el modo avión: todo se guarda en el teléfono y se envía
solo al volver la conexión (pantalla _Perfil → Sincronización_).

## Pruebas

```bash
npm run driver:test      # lógica de la cola sin conexión y del resumen (vitest)
npm run web:test         # lógica del carrito del POS (vitest)
npm run db:seed && npm run api:test:int   # inventario contra PostgreSQL: PEPS y ventas simultáneas
npm run db:seed && npm run api:smoke   # flujo completo del repartidor contra la API en marcha (20 verificaciones)
npm run pos:smoke        # flujo completo del POS contra la API en marcha (38 verificaciones; requiere el seed)
npm run routes:smoke     # supervisor + repartidor: crear rutas, GPS, llegadas, monitoreo y eficiencia (25 verificaciones; requiere el seed)
```

Antes de subir cambios: `npm run lint` y `npm run format`.

El CI de GitHub (`.github/workflows/ci.yml`) corre todo lo anterior en cada push. Plan de mejoras pendientes: [PLAN-MEJORAS.md](PLAN-MEJORAS.md).
