# Publicar Forragest en un servidor

Objetivo: que la app móvil consuma una API que vive en un servidor con dominio público y HTTPS, no en tu computadora.

```
Celular (app Forragest) ──HTTPS──▶ Servidor (API NestJS) ──▶ Base de datos PostgreSQL
```

Además de cumplir con el reporte, con HTTPS la app **ya puede instalarse en el celular y usar el GPS** (en local no).

## Qué hay preparado en el repositorio

| Archivo                      | Para qué sirve                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/Dockerfile`        | Imagen de la API. Al arrancar aplica las migraciones y levanta el servicio. Probada: construye, arranca y responde en `/health`. |
| `render.yaml`                | "Blueprint" de Render: crea la base de datos, la API y la app móvil con un clic.                                                 |
| `.env.example`               | Variables que necesita la API (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`…).                                                   |
| `GET /health`                | Estado público del servicio y de la base de datos.                                                                               |
| `scripts/reporte-remoto.mjs` | Genera el reporte con evidencia (ver abajo).                                                                                     |

Seguridad ya incluida: en producción la API **no arranca** si `JWT_SECRET` falta o es débil, y con `CORS_ORIGINS` solo acepta peticiones de tus apps.

## Opción recomendada: Render (tiene plan gratuito)

Necesitas una cuenta en [GitHub](https://github.com) y otra en [Render](https://render.com). Revisa en su sitio los límites vigentes del plan gratuito: normalmente el servicio "se duerme" tras unos minutos sin uso y tarda en despertar en la primera petición, y la base gratuita tiene vigencia limitada. Para una demostración sirve; para uso real conviene un plan de pago.

1. **Sube el proyecto a GitHub** (hoy solo existe en tu computadora):
   ```bash
   git remote add origin https://github.com/TU_USUARIO/forragest.git
   git push -u origin master
   ```
2. En Render: **New › Blueprint** y elige el repositorio. Detecta `render.yaml` y crea tres cosas: `forragest-db`, `forragest-api` y `forragest-repartos` (la app móvil).
3. Cuando pida valores, déjalos vacíos por ahora: `CORS_ORIGINS`, `SEED_PASSWORD` y `VITE_API_URL`.
4. Al terminar, copia las dos direcciones que Render asignó (por ejemplo `https://forragest-api.onrender.com` y `https://forragest-repartos.onrender.com`) y completa:
   - En la API: `CORS_ORIGINS` = dirección de la app móvil, y `SEED_PASSWORD` = una contraseña propia (no uses `cambiar123`).
   - En la app móvil: `VITE_API_URL` = dirección de la API.
     Guarda y pulsa **Manual Deploy** en la app móvil (el valor se incorpora al compilar).
5. **Carga los datos de demostración** desde tu computadora, apuntando a la base remota (copia la _External Database URL_ desde Render):
   ```bash
   DATABASE_URL="postgresql://…externa…" SEED_PASSWORD="tu-contraseña" npm run db:seed
   ```
   Importante: el seed reconstruye los datos de demostración. Úsalo solo en una base de demostración, nunca sobre datos reales.
6. Comprueba que está viva: abre `https://TU-API.onrender.com/health` → debe mostrar `"status":"ok"` y `"db":"up"`.

## Cualquier otro servidor con Docker (VPS, servidor de la escuela)

```bash
docker build -f apps/api/Dockerfile -t forragest-api .
docker run -d -p 3000:3000 \
  -e NODE_ENV=production -e JWT_SECRET=<64 caracteres aleatorios> \
  -e DATABASE_URL=postgresql://usuario:clave@host:5432/forragest \
  -e CORS_ORIGINS=https://tu-app.ejemplo.com forragest-api
```

Pon delante un proxy con HTTPS (Caddy, Nginx o el del proveedor). La app móvil se compila con `VITE_API_URL=https://tu-api.ejemplo.com npm run build -w apps/driver` y la carpeta `apps/driver/dist` se publica en cualquier hosting estático (Netlify, Cloudflare Pages, Vercel…); ya incluye el archivo `_redirects` para las rutas internas.

Genera un secreto así: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## El reporte de consumo remoto

Con la API y la app publicadas, desde tu computadora:

```bash
npm run reporte:remoto -- --api https://TU-API.onrender.com --app https://TU-APP.onrender.com
```

Si cambiaste la contraseña de los usuarios de demostración: `REPORT_PASSWORD="tu-contraseña" npm run reporte:remoto -- …`

Qué hace:

1. Comprueba el destino: dominio público (no `localhost` ni red privada), DNS y certificado HTTPS.
2. Consulta `/health` cinco veces: estado del servicio, base de datos y latencia.
3. Inicia sesión y lee catálogos de la API publicada.
4. Abre la app móvil en un navegador con tamaño de celular y registra **todas sus peticiones de red**: verifica que van al dominio de la API y ninguna a un equipo local.
5. Hace una prueba real: crea una ruta de prueba, sale a ruta, entrega **con conexión**, entrega **sin conexión** (queda guardada en el teléfono y no llega al servidor), recupera la conexión y verifica que se **sincroniza sola**, y cierra la ruta; todo confirmado consultando la base del servidor.

Resultado: la carpeta `reporte-consumo-remoto/<fecha>/` con `reporte.html` (listo para entregar o imprimir como PDF, con tablas y capturas) y `evidencia.json`.

- Solo lectura (no crea nada en el servidor): agrega `--solo-lectura`.
- La prueba de escritura crea la ruta **"Ruta Reporte remoto (e2e)"** para el chofer `chofer2`; se identifica por ese nombre.
- Si el reporte dice "No se pudo demostrar", cada punto fallido indica el motivo (por ejemplo, que la API sigue apuntando a `localhost`).

## Respaldos diarios (gratis, con GitHub Actions)

El flujo `.github/workflows/respaldo.yml` saca cada noche (3:17 a. m., hora del centro de México) una copia **cifrada** de la base y la guarda 30 días en GitHub, dentro de la pestaña _Actions → Respaldo diario → Artifacts_.

Para activarlo, en GitHub: _Settings → Secrets and variables → Actions → New repository secret_:

| Secreto               | Valor                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_DATABASE_URL` | En Render: tu base de datos → _Connect_ → **External Database URL**                                                         |
| `BACKUP_PASSPHRASE`   | Una contraseña larga. **Guárdala aparte** (por ejemplo en tu gestor de contraseñas): sin ella el respaldo no se puede abrir |

Para probarlo sin esperar a la noche: _Actions → Respaldo diario → Run workflow_.

**Restaurar** (requiere PostgreSQL 16 instalado en tu computadora): descarga el artefacto, descomprime el `.zip` y ejecuta

```bash
DATABASE_URL="postgresql://..." BACKUP_PASSPHRASE="..." ./scripts/restaurar.sh forragest-AAAAMMDD-HHMM.dump.gpg
```

> Ojo: en el plan gratuito de Render la base de datos tiene vigencia limitada. Estos respaldos te permiten pasar los datos a una base nueva cuando eso ocurra.

## Registros (logs) y errores

La API escribe una línea JSON por petición, visible en el panel _Logs_ de Render. Cada respuesta trae la cabecera `X-Request-Id`; si algo falla, el usuario ve _“Código de referencia: 1a2b3c4d”_ y basta buscar ese código en los logs para ver el error completo. Los tokens y contraseñas nunca se escriben. Nivel de detalle: variable `LOG_LEVEL` (`info` por defecto; `debug`, `warn`, `error`).
