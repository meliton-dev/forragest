# Forragest en tu computadora (copia local)

Todo el sistema corre en tu PC: la base de datos, la API, el punto de venta y oficina, y la app del chofer. No usa nada de lo publicado en Render; los datos son la **Forrajera San Miguel** simulada y solo viven en tu computadora.

## Lo que necesitas (una sola vez)

1. **Node.js 22**: descárgalo de <https://nodejs.org> (versión "LTS") e instálalo.
2. **Docker Desktop**: descárgalo de <https://www.docker.com/products/docker-desktop/> e instálalo.
3. Internet **solo la primera vez**, para descargar las dependencias y la imagen de la base de datos.

## Arrancar

1. Abre **Docker Desktop** y espera a que diga que está listo.
2. Abre **PowerShell** en la carpeta del proyecto (en el Explorador de archivos: clic derecho dentro de la carpeta → "Abrir en Terminal").
3. Escribe:

```powershell
npm run local
```

La primera vez tarda unos minutos (instala lo necesario y carga los datos). Cuando veas **"✔ Forragest está listo en esta computadora"**, abre en el navegador:

| Qué                      | Dirección                      |
| ------------------------ | ------------------------------ |
| Punto de venta y oficina | <http://localhost:5174>        |
| App del chofer           | <http://localhost:5173>        |
| Estado de la API         | <http://localhost:3000/health> |

Para **detenerlo**: en esa ventana de PowerShell presiona **Ctrl + C**. Lo que hiciste se guarda; la próxima vez que corras `npm run local` sigue donde lo dejaste (y agrega los días que falten, para que siempre haya "hoy").

## Usuarios

| Usuario              | Quién (ficticio)         | Qué ve                                               |
| -------------------- | ------------------------ | ---------------------------------------------------- |
| `admin`              | Dueño                    | Oficina: rutas, compras, **Ventas** y **Usuarios**   |
| `cajero`             | Cajera, caja 1           | Punto de venta, ventas del día, devoluciones, corte  |
| `cajero2`            | Cajera, caja 2           | Lo mismo que `cajero`                                |
| `supervisor`         | Supervisor de rutas      | Rutas, nueva ruta, monitoreo en vivo, eficiencia     |
| `compras`            | Gerente de compras       | Órdenes, sugerencias, proveedores, cuentas por pagar |
| `almacen`            | Almacenista              | Aún no tiene pantallas (solo cambiar contraseña)     |
| `chofer`             | Repartidor (ruta de hoy) | App del chofer (`localhost:5173`)                    |
| `chofer2`, `chofer3` | Repartidores             | App del chofer                                       |

La contraseña de todos en la copia local es la de demostración que aparece en `README.md`. Es solo para tu PC; **no es la de producción**.

## Volver a dejarlo limpio

Si quieres borrar todo lo que hiciste (ventas de prueba, rutas, contraseñas cambiadas) y empezar de cero:

1. Detén Forragest (Ctrl + C) si está corriendo.
2. Escribe:

```powershell
npm run local:reiniciar
```

3. Escribe `SI` cuando lo pida. Luego arranca otra vez con `npm run local`.

Para apagar también la base de datos (por ejemplo, para liberar memoria):

```powershell
npm run local:detener
```

## Sin internet: qué funciona y qué no

| Parte                                                                   | Sin internet                                                                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ventas, devoluciones, corte, compras, rutas, entregas, cobros, usuarios | **Funciona** completo                                                                                                                                           |
| Trazo de la ruta por las calles                                         | Se dibuja en **línea recta** entre paradas (a propósito, para no depender de un servicio externo). Con internet puedes usar calles: `npm run local -- --calles` |
| Fondo del mapa (calles, colonias)                                       | Se ve **gris**: las imágenes del mapa vienen de OpenStreetMap. Los puntos, paradas y rutas sí aparecen                                                          |
| Botón "Navegar" del chofer                                              | Abre Google Maps, que es otra aplicación                                                                                                                        |
| GPS del chofer desde un **celular**                                     | No: el navegador del celular exige HTTPS. En la misma PC (`localhost`) sí se permite                                                                            |

## Si algo falla

- **"Docker no está encendido"**: abre Docker Desktop, espera y vuelve a intentar.
- **"El puerto … ya está ocupado"**: Forragest ya está abierto en otra ventana. Ciérrala con Ctrl + C (o reinicia la PC).
- **"DATABASE_URL apunta a …"**: esa ventana de PowerShell quedó configurada para otra base (por ejemplo, la de Render). Ciérrala y abre una nueva.
- **Moviste o copiaste la carpeta del proyecto**: no pasa nada; `npm run local` lo detecta y reinstala las dependencias solo.
- **Pantalla en blanco** en el navegador: recarga la página (F5). Si sigue, detén con Ctrl + C y vuelve a correr `npm run local`.

## Para desarrolladores

`npm run local` hace, en orden: `npm install` si faltan dependencias o los enlaces del monorepo apuntan a otra carpeta; crea `apps/api/.env` si no existe (base local y `JWT_SECRET` aleatorio); se niega si `DATABASE_URL` no es `localhost`; `docker compose up -d db`; `prisma migrate deploy`; `db:seed` con `SEED_KEEP_TODAY=1` (no rehace una ruta de hoy que ya salió); y arranca `api:dev` (con `ROUTING_URL` vacío salvo `--calles`), `web:dev` y `driver:dev`. Código en `scripts/local.mjs`. Las pruebas no usan esta base: ver CONTEXTO.md ("Probar como el CI en local").
