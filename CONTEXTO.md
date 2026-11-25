# Contexto del proyecto Forragest

Resumen de lo que se ha hecho y decidido hasta noviembre de 2026, para retomar el trabajo sin releer toda la conversación. Lo que dice el código manda sobre este archivo: si algo no coincide, confía en el código y corrige este documento.

## Qué es

**Forragest** es el sistema de una forrajera (tienda de alimento para animales). Tiene tres piezas:

| Pieza                | Para quién                               | Dónde vive                                                  |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Punto de venta (web) | Cajero (y administrador)                 | `apps/web`, rutas `/`, `/ventas`, `/devoluciones`, `/corte` |
| Oficina (web)        | Supervisor de rutas, gerente de compras  | `apps/web`, rutas `/rutas/*` y `/compras/*`                 |
| App del repartidor   | Chofer, en el celular (PWA sin conexión) | `apps/driver`                                               |
| API                  | Las tres anteriores                      | `apps/api` (NestJS + Prisma + PostgreSQL)                   |

Monorepo con npm workspaces: `apps/api`, `apps/web`, `apps/driver`, `packages/shared` (enums, etiquetas y errores comunes). Roles: `ADMINISTRADOR`, `CAJERO`, `ALMACENISTA`, `CHOFER`, `GERENTE_COMPRAS`, `SUPERVISOR_RUTAS`. El administrador pasa todas las guardas.

## Producción (Render, plan gratuito)

- Web: https://forragest-web.onrender.com (sitio estático; reenvía `/api` a la API, sin CORS)
- App del repartidor: https://forragest-repartos.onrender.com
- API: https://forragest-api.onrender.com (`/health` muestra estado y hora del servidor)
- Código: https://github.com/Melf1852/forragest (rama `main`). Render despliega solo al empujar a `main`.
- La API aplica las migraciones de Prisma al arrancar (`prisma migrate deploy`) y luego levanta.
- `render.yaml` define la base, la API y los dos sitios estáticos. Los servicios gratuitos se duermen sin uso y la base gratuita tiene vigencia limitada.
- Variables de la API que importan: `DATABASE_URL`, `JWT_SECRET` (mínimo 24 caracteres), `CORS_ORIGINS` (**obligatoria en producción**: direcciones completas con `https://`, separadas por coma, sin comodines), `SEED_PASSWORD`, `APP_TIMEZONE` (por defecto `America/Mexico_City`), `ROUTING_URL` (servicio de rutas por calles; vacío = líneas rectas), `PING_RETENTION_DAYS` (por defecto 45), `LOG_LEVEL`.
- Respaldo diario cifrado con GitHub Actions (`.github/workflows/respaldo.yml`): necesita los secretos `BACKUP_DATABASE_URL` y `BACKUP_PASSPHRASE` (ver `DEPLOY.md`).
- **Base actual: `forragest-db-2`** (creada el 19 nov 2026 por el Blueprint, caduca ~19 dic 2026: ver la fecha en su página de Render). Tiene **solo la forrajera simulada**. La primera, `forragest-db`, quedó **suspendida** (no borrada) porque Render solo permite una base gratuita activa; caduca el 3 dic 2026. Para la siguiente base: cambiar el nombre en `render.yaml` (`databases` y `fromDatabase`), suspender o borrar la anterior y hacer "Manual sync" del Blueprint (pide "Approve").
- **`SEED_ON_BOOT=1`** (en `render.yaml`): al arrancar, `apps/api/start.sh` aplica migraciones, corre el seed (completa los días que falten y rehace la ruta de hoy si no ha salido) y levanta la API. Suma unos segundos al arranque en frío. Quitarlo si algún día hay un cliente real.
- Los usuarios de demostración (`admin`, `cajero`, `cajero2`, `almacen`, `chofer`, `chofer2`, `chofer3`, `compras`, `supervisor`) existen en producción con la contraseña de `SEED_PASSWORD` (variable de `forragest-api`, puesta nueva por la persona el 19 nov 2026). No se guardan contraseñas de producción en el repositorio ni en este archivo. Sin `SEED_PASSWORD` el seed se cancela solo y la API arranca sin datos.

## Cómo trabajamos (acuerdos)

1. Idioma: español. La persona que usa el proyecto no es técnica en todo; explicar en términos simples qué se hizo y qué falta.
2. Cada cambio va en **una rama aparte** desde `main`, con pruebas, y se sube para que corra el CI de GitHub (`.github/workflows/ci.yml`: lint, formato, compilación, pruebas unitarias, de integración y los tres flujos completos contra una API real).
3. Antes de publicar se **pregunta**. Cuando la persona dice "publícalo", se hace `git merge --ff-only <rama>` y `git push origin main`, y después se **verifica producción** (servicio reiniciado, build nuevo servido). Ese permiso es por cada publicación, no general.
4. Prettier es obligatorio (`npx prettier --write .`); el CI falla si hay archivos sin formato. ESLint tiene ~11 avisos de `any` conocidos, sin errores.
5. Para diseño visual, enseñar **maquetas** y dejar elegir; describir con palabras no funcionó bien.
6. No poner datos personales ni credenciales en servicios externos, commits ni documentos.

## Lo que ya está hecho

**Inventario y caja (POS):** inventario PEPS por lotes; ventas de contado/transferencia/tarjeta/crédito; descuentos con autorización de supervisor; devoluciones con notas de crédito; cancelaciones; corte de caja con arqueo; tickets de 58/80 mm. Existencias protegidas contra ventas simultáneas (bloqueo de filas y `CHECK (quantity >= 0)`).

**Rutas y reparto:** el supervisor crea rutas con paradas y productos; el chofer carga el camión, sale a ruta, registra llegada, entrega (con firma o foto), cobros, incidencias y **entrega parcial** (indica cuánto deja por producto; lo no entregado regresa al almacén al cerrar); funciona sin conexión y sincroniza después. Eficiencia de entregas (a tiempo/tardías) para el supervisor.

**Compras (Fase 4):** proveedores, órdenes de compra, recepción parcial, historial de precios, sugerencias de reorden y cuentas por pagar con vencimientos.

**Mejoras de calidad:** CI en GitHub, ESLint/Prettier, paquete compartido, logs estructurados (pino) con código de referencia de errores, límite de intentos de login y cabeceras de seguridad (helmet), respaldos diarios cifrados.

**Cambios de esta etapa (todos publicados en `main`, commit `569dba5` al escribir esto):**

- **Diseño "Campo"** en web y app del repartidor: verde bosque (`--ink #1f4d3a`), crema (`--bg #f4efe4`), terracota (`--accent #b8482f`) solo para acciones, dorado (`--gold #e9b949`); títulos en Fraunces y texto en Nunito Sans; ilustraciones por especie (componente `Species` en `apps/web/src/ui/kit.tsx`) y paisajes en las pantallas de entrada. Estados de éxito ("a tiempo", "entregada", avance) en **verde**, nunca terracota (se confundía con error).
- **Turnos de caja sin carreras:** índice único parcial (un turno abierto por cajero) y cierre transaccional; ventas, devoluciones y cancelaciones toman el turno en modo compartido. En producción la API **no arranca** sin `CORS_ORIGINS` válido.
- **Ubicación en vivo:** la app del chofer guarda ubicación cada 10 s, mantiene la pantalla encendida mientras comparte y sube en lote; el mapa del supervisor (`/rutas/mapa`) se refresca cada 5 s con `GET /routes/live` (ligero) y pide el detalle completo cada 30 s; muestra velocidad, "Sin señal" y botón "Ver en el mapa". Los saltos imposibles del GPS (>160 km/h) se descartan. Las ubicaciones de más de 45 días se borran solas.
- **Rutas por calles:** `POST /routes/path` pide el trayecto al servicio público **OSRM** (caché de 24 h, consultas espaciadas, respaldo a línea recta). Se dibuja en el monitoreo y en la vista previa de "Nueva ruta" con km y minutos. OSRM recibe solo coordenadas, sin nombres.
- **Zona horaria del negocio:** Render corre en UTC y a partir de las 18:00 de México "hoy" caía en el día siguiente (Rutas de reparto vacía, entregas "tardías", Ventas del día mal). Todo lo que use "hoy" u horas locales pasa por `apps/api/src/common/time.ts`.
- **Menú lateral del cajero** (riel con icono y nombre, turno y "Salir" abajo) en lugar del menú de arriba.
- **Ticket de venta:** la lista de productos tiene espacio y baja sola al último agregado; cantidad **editable** (teclear 12, o 2.5 kg en granel, con tope en la existencia); botón para quitar un producto completo.

**Rama `listo-produccion` (sobre `datos-forrajera`, para la presentación):**

- **Límite del cuerpo:** 200 KB para todo; 10 MB solo en `POST /driver/stops/:id/deliver`, `/driver/stops/:id/fail` y `/driver/incidents` (firmas y fotos). Está en `apps/api/src/common/body-limit.ts`; `main.ts` crea la app con `bodyParser: false`. Un cuerpo grande responde 413 y un JSON roto 400 (no 500). Si se agrega una ruta con imágenes, hay que sumarla ahí.
- **Login y autorización de supervisor** con tope de longitud (64/128); el limitador guarda un hash si la llave es larga. La llave del supervisor incluye al cajero que intenta: 5 errores de una caja ya no bloquean a las demás.
- **Cerrar una ruta** reclama el cierre con `updateMany` condicionado: un doble cierre ya no regresa el inventario dos veces.
- **Seed protegido:** se niega a correr contra una base que no sea `localhost` sin `SEED_ALLOW_REMOTE=1`, y ahí exige `SEED_PASSWORD`. No cambia contraseñas ni nombres de usuarios existentes salvo con `SEED_RESET_PASSWORDS=1`. En base remota no toca la ruta de hoy si ya salió; en base local la rehace siempre (`routes:smoke` la necesita sin iniciar). Las rutas programadas solo se borran si son de días posteriores. `npm run db:reset` se niega fuera de `localhost` (`scripts/db-reset.mjs`, `apps/api/prisma/db-guard.js`).
- **Tablet vertical:** de 700 a 900 px el botón "Cobrar e imprimir ticket" ocupa toda la fila y Cancelar va debajo.
- `DEPLOY.md` explica cómo cambiar a una base nueva de Render y cargar el seed desde PowerShell.
- **Decisión:** para la presentación se crea una **base nueva y vacía** en Render y se carga ahí el seed, en lugar de correrlo sobre la base vieja. Revisión del seed sobre datos existentes: borra rutas ajenas, no usa transacciones y tarda 6-10 min contra Render; solo es seguro en base vacía.
- La base gratuita vieja caducaba hacia el 3-4 dic 2026 (estimación: creada ~3 nov).

**Rama `conexion-automatica` (desde `main`, SIN publicar): la app del chofer no muestra nada de conexión.**

- Se quitaron el interruptor "Modo sin conexión" (era decorativo), la pantalla Sincronización, el aviso amarillo de "Sin conexión / por sincronizar", las etiquetas "Por sincronizar", el globito de pendientes en la pestaña Perfil y los textos de ayuda/tutorial sobre señal. El tutorial ahora tiene 3 pasos.
- **Ubicación siempre en ruta:** sin interruptor ni "Ahora no". La primera vez (por chofer, preferencia `gpsNotice`) sale un aviso informativo "Tu ubicación se comparte durante la ruta" con "Entendido"; después el teléfono pide su permiso (no se puede saltar). Si el permiso se niega, el chofer sí ve el aviso para activarlo.
- **Nada se pierde:** lo guardado va por chofer (`fd.state.v2.<userId>`; lo de `fd.state.v1` se adopta al entrar). Un 401 o "Cerrar sesión" ya NO borran la cola: se envía cuando la misma persona vuelve a entrar; otro chofer en el mismo teléfono no la ve. Las ubicaciones pendientes van por ruta (`fd.pings.v2.<routeId>`).
- **El supervisor sí ve el estado:** la app manda `POST /driver/status` cada 30 s, al recuperar señal y tras enviar algo (`pending`, `oldestPendingAt`, `rejected`, `gps`). Se guarda en `Route` (`lastSeenAt`, `pendingOps`, `oldestPendingAt`, `rejectedOps`, `gpsStatus`, migración `20261124000000_estado_app_chofer`); las ubicaciones también actualizan `lastSeenAt`. `/routes/live` y `/routes/monitor` traen `sync`; el monitoreo muestra "Sin señal desde las HH:MM" (más de 3 min sin noticias), "N registros guardados en el teléfono sin enviar desde las HH:MM", rechazados y GPS sin permiso (`driverStatus()` en `apps/web/src/lib/live.ts`).
- **Excepción a propósito:** cargar el camión y salir a ruta sigue necesitando conexión (el servidor valida y descuenta el inventario); si falla, el chofer ve "No se pudo registrar la salida del almacén. Intenta de nuevo en un momento." El inicio de sesión también necesita conexión.
- Al fusionar con `usuarios-contrasenas` habrá conflicto en `apps/driver/src/lib/store.ts` (las dos ramas cambiaron cómo se conserva la cola al vencer la sesión): quedarse con las claves por chofer de esta rama y agregar el manejo del 403 `PASSWORD_CHANGE_REQUIRED` de la otra.

**Rama `rendimiento-letras` (sobre `conexion-automatica`, SIN publicar): mejoras de la revisión con Context7.**

- **Letras variables** (`@fontsource-variable/fraunces` y `nunito-sans`, familias `'Fraunces Variable'` y `'Nunito Sans Variable'`): un archivo por alfabeto con todos los grosores. El service worker del chofer solo guarda las de alfabeto latino (`*-latin-wght-*.woff2`) y el resto al vuelo si alguna vez se usa: **832 KB (54 archivos) → 110 KB (3)**. Se quitaron `@fontsource/inter` (sin uso) y las letras estáticas.
- **App del chofer con `LazyMotion` + `m`** (`strict`): las funciones de animación (`domMax`, porque hay `layoutId`) llegan en un archivo aparte (`lib/motion-features.ts`). Archivo principal 355 KB → 269 KB. Usar siempre `m.`, nunca `motion.` (con `strict` truena).
- **Web: oficina bajo demanda** con `React.lazy` en `App.tsx` y `Suspense` dentro de `BackShell`. Archivo principal 441 KB → 228 KB (132 → 72 KB comprimido); Leaflet (154 KB) solo baja al abrir Monitoreo o Nueva ruta. `vite:preloadError` recarga una vez si se publica una versión nueva con la página abierta.
- **Pendientes de la revisión** (cambian el aspecto: enseñar maquetas antes): contraste de `--text-3` sobre `--bg` (4.33:1), verde de éxito sobre su fondo (4.38:1) y bordes de campos (1.49:1; WCAG pide 4.5 y 3); textos de 12-13 px en la app del chofer; 52 colores escritos a mano y estilos en línea en la web.

## Datos de demostración: la forrajera simulada

No hay un cliente real: se **simula** uno, la **Forrajera San Miguel** (Tulancingo, Hgo.), para que el sistema se vea como en un negocio en marcha. Todo es inventado (personas, negocios, RFC, teléfonos con el patrón 555-01xx, correos `.example`). Está en `apps/api/prisma/seed-data.ts` (los datos) y `apps/api/prisma/seed.ts` (cómo se cargan). Rama `datos-forrajera`.

- **Qué carga:** 9 personas (dueño, 2 cajeras, almacenista, compras, supervisor, 3 choferes), 3 camiones, 37 productos en las tres líneas, 25 clientes repartidos en 5 zonas de reparto, 8 proveedores, 18 órdenes de compra (recibidas, en camino y un borrador) con cuentas por pagar pagadas, por vencer y una vencida, unas 3 semanas de ventas de mostrador con cortes de caja, 18 días de rutas terminadas, la ruta de hoy y las programadas para el siguiente día hábil. Se trabaja de lunes a sábado; el domingo no se abre.
- **El inventario cuadra:** lo recibido en compras menos lo vendido es la existencia. La primera vez, el seed vende lo que sobra respecto a la existencia normal de cada producto (`stock` en `seed-data.ts`); después solo agrega los días que falten. Tres productos quedan bajos a propósito (sal mineralizada agotada, codorniz y bloque ovino) para que haya sugerencias de compra.
- **Se puede repetir** (`npm run db:seed`): reconoce lo suyo por la nota de la orden de compra y por `clientOpId` `seed-v-…` en las ventas; rehace el historial de rutas y la ruta de hoy. El azar es repetible (sale de la fecha), así que no cambia la historia.
- **Anclas que usan las pruebas** (no cambiarlas sin revisar `apps/api/test`): los nombres de usuario y que `admin` sea el usuario 1; `BV-001` saco de 40 kg a $430 y `AV-001` a $380; `BV-002` agotado y con "Sal mineralizada" en el nombre; solo `AV-001` lleva "postura"; los cinco clientes de la ruta de hoy; _Borregos La Loma_ con exactamente $14,300 vencidos; choferes "Luis Gómez" y "Marco Díaz"; la ruta de hoy con 5 paradas, 9 sacos de `BV-001`, 3 de `OV-001` en la parada 2 y **un solo producto en la parada 4**.
- `npm run db:reset` borra **toda** la base local y la carga limpia. Las pruebas de integración dejan basura ("Ruta en vivo…", "Chofer en vivo", productos de prueba) que el seed no quita.
- Para probar el seed como lo hace el CI: una base vacía aparte (`CREATE DATABASE …`, `prisma migrate deploy`, seed) y una API en el puerto 3001 con ese `DATABASE_URL`.

## Lecciones y trampas (leer antes de tocar)

- **Fechas sin hora en la web** (vencimientos, entrega esperada, `Route.date`): la API las guarda a medianoche UTC. Formatearlas con `toLocaleDateString` en México las muestra **un día antes**. Usar `diaCalendario()` de `apps/web/src/lib/format.ts` (formatea en UTC); para momentos con hora, `diaCorto()`. Se vio en Cuentas por pagar el 19 nov 2026 ("15 nov · hace 3 días" cuando vencía el 16).

- **Fechas:** nunca usar `getDate()`/`getHours()` ni `new Date()` para "hoy" en la API. Usar `businessDate()`, `startOfBusinessDay()`, `atBusinessTime()`. Para probar: `TZ=UTC` en jest y una API aparte en el puerto 3001; la PC de la persona está en hora de México y **oculta** el fallo.
- **Inyección de dependencias de Nest:** un servicio con un parámetro de constructor que Nest no sabe resolver pasa las pruebas unitarias pero **la API no arranca**. Existe `apps/api/test/int/boot.int-spec.ts` que levanta la aplicación completa; no quitarla.
- **Probar como el CI en local:** base aparte `forragest_ci` (`docker compose exec -T db psql -U forrajera -d forrajera -c "CREATE DATABASE forragest_ci"`), `prisma migrate deploy`, `db:seed`, `api:test:int`, y la API compilada en el puerto 3001 (`PORT=3001`) para los smokes pasando `http://localhost:3001` como argumento. Todo con `TZ=UTC`.
- **Pruebas locales ensucian la base:** las pruebas de integración crean clientes, productos y rutas. `npm run api:smoke` repetido sobre la misma base falla por `clientOpId` repetidos: borrar antes `Payment` e `Incident` con `clientOpId LIKE 'smoke-%'` y volver a correr `npm run db:seed`. Las rutas de prueba se dejan `FINALIZADA` para que no salgan "en curso" en el mapa.
- **Prettier en Windows:** el repositorio guarda LF y Git en esta PC convierte a CRLF; `prettier --check` puede avisar de archivos que no cambiaron. Correr `npx prettier --write .` antes de confirmar.
- **Vite tras cambiar de rama con cambios sin confirmar** puede quedar con un módulo a medias y mostrar la pantalla en blanco: reiniciar el servidor de desarrollo.
- **Docker Desktop** no arranca solo en esta PC; si la API local da `P1001`, abrirlo y `docker compose restart db`.
- **El navegador necesita HTTPS para el GPS:** en local no hay ubicación real; se simula con `navigator.geolocation` falso o con peticiones a `/driver/locations`.
- Una app web **no puede rastrear en segundo plano**: la ubicación solo funciona con la app abierta, la ruta en curso y el chofer con "Compartir ubicación" activado.
- Entre ramas apiladas, ambas suelen agregar reglas al final de `apps/web/src/styles.css`: al fusionar, conservar las dos partes.

## Comandos útiles

```bash
npm install
docker compose up -d db
npm run db:seed                      # reinicia datos de demostración y la ruta de hoy
npm run api:dev                      # API en :3000
npm run web:dev                      # web en :5174 (proxy /api -> :3000)
npm run driver:dev                   # app del chofer en :5173
npm run api:test                     # unitarias de la API
npm run api:test:int                 # integración (usa la base local)
npm run driver:test && npm run web:test
npm run api:smoke && npm run pos:smoke && npm run routes:smoke   # flujos completos contra una API en marcha
npx prettier --write . && npx eslint apps packages
```

Cuentas de demostración locales: contraseña `cambiar123` (está en `README.md`). Servidores de vista previa del escritorio: `.claude/launch.json` (no versionado).

## Archivos excluidos a propósito

`docs/informe/` y `scripts/capturas-informe.mjs` están en `.git/info/exclude`: eran para un informe escolar que la persona pidió dejar fuera del repositorio. `reporte-consumo-remoto/` (evidencia de que la app móvil consume la API publicada) tampoco se versiona.

También excluidos: `docs/informe-u3/` y `scripts/pruebas-informe-u3.mjs`, del reporte «Pruebas Debug y Release» de la Unidad III (16 nov 2026). El guion prueba la app del repartidor en modo depuración (`vite` en :5175) y en modo liberación (`vite build` + `vite preview` en :4173, entrada `driver-release` de `.claude/launch.json`): carga inicial con y sin red 4G lenta, código que se entrega, recorrido completo de 14 pasos y arranque sin conexión. `docs/informe-u3/generar.mjs` arma el PDF (cuerpo en `cuerpo.html`, portada con el formato de la Unidad I, estilos del informe anterior, índice con páginas calculadas con `pdftotext`). En esta PC no hay `pdftoppm`: los PDF se leen con `pdftotext`. Pendientes que el reporte declara: Lighthouse, Sentry y prueba en teléfono real.

## Pendiente

0. ~~Forrajera simulada en producción~~: hecho el 19 nov 2026 (base nueva `forragest-db-2`, 304 ventas en 21 días hábiles). Falta revisar las pantallas con sesión en producción (la contraseña la tiene la persona) y regenerar `JWT_SECRET` en Render para invalidar tokens emitidos con la base vieja (los ids de usuario coinciden).
1. **Rotar la contraseña de demostración compartida** y crear usuarios reales: es el mayor riesgo de producción (todos los roles comparten contraseña). Al menos `admin` y `supervisor` con contraseñas propias, y regenerar `JWT_SECRET` para cerrar sesiones (el token dura 12 h y no se revoca al desactivar al usuario).
2. **Activar los respaldos diarios** agregando los dos secretos en GitHub (`BACKUP_DATABASE_URL` = External URL de `forragest-db-2`).
3. **Fotos y firmas fuera de la base** (hoy son base64 en `Delivery`/`Incident`): requiere elegir dónde guardarlas (R2, S3 o disco). Hay un límite de 10 MB por petición.
4. Revisar con un **celular real en la calle** la ubicación en vivo y el envío automático al recuperar señal (solo se probó con GPS y cortes de red simulados) y la **ruta por calles en producción** (que la API de Render alcance a OSRM).
5. Consultas de ventas por rol: hoy cualquier cajero ve las ventas de hoy de todos los cajeros (hace falta para devoluciones por folio); decidir si se restringe.
6. Si el uso crece: servidor propio o de pago para rutas por calles, plan de pago en Render, y monitoreo de errores con alertas (p. ej. Sentry).
7. El día de la presentación: abrir `https://forragest-api.onrender.com/health` 10 min antes (el arranque en frío tardó 33 s).
8. **Seguridad que quedó para después** (auditoría de nov 2026): devoluciones en efectivo sin supervisor y sin límite de fecha; GET de inventario/productos sin `@Roles` (el chofer ve costos); el chofer puede registrar cobros con `stopId` de otra ruta; listas de DTO sin `@ArrayMaxSize`; `npm audit` con avisos (`body-parser`, `qs`); sitios estáticos sin CSP propia.

## Documentos relacionados

`README.md` (arranque y comandos), `DEPLOY.md` (publicar, respaldos, logs), `PLAN-MEJORAS.md` (mejoras de calidad y su estado), `render.yaml`, `.env.example`.
