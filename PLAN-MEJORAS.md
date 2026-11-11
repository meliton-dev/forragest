# Plan de mejoras

Resultado de la revisión del proyecto (noviembre 2026). Ordenado por prioridad: primero lo que puede dañar datos de dinero o inventario.

| #   | Mejora                                                    | Estado       |
| --- | --------------------------------------------------------- | ------------ |
| 1   | Existencias negativas con ventas simultáneas              | ✅ Hecho     |
| 2   | CI en GitHub: compilar y probar en cada cambio            | ✅ Hecho     |
| 3   | Más pruebas en la API (inventario, crédito, devoluciones) | ✅ Hecho     |
| 4   | Límite de intentos de login y cabeceras de seguridad      | ✅ Hecho     |
| 5   | Fotos y firmas fuera de la base de datos                  | ⏳ Pendiente |
| 6   | ESLint y Prettier                                         | ⏳ Pendiente |
| 7   | Tipos compartidos entre API y apps (`packages/shared`)    | ⏳ Pendiente |
| 8   | Respaldos, monitoreo de errores y logs estructurados      | ⏳ Pendiente |

## 1. Existencias negativas

**Problema:** dos ventas del mismo producto al mismo tiempo leían la misma existencia y ambas pasaban.
**Solución:**

- Antes de descontar, la transacción bloquea la fila del producto (`SELECT … FOR UPDATE`); la segunda venta espera a la primera y ve la existencia real.
- Las ventas y cargas con varios productos los bloquean en orden de id, para que dos ventas no se esperen mutuamente (deadlock).
- Red de seguridad en la base: `CHECK (quantity >= 0)` en `StockLot`.

## 2. CI

`.github/workflows/ci.yml`: con PostgreSQL de servicio, instala, aplica migraciones, compila las 3 apps y corre las pruebas unitarias y de integración.

## 3. Pruebas de la API

Pruebas de integración contra PostgreSQL real (`apps/api/test/*.int-spec.ts`, `npm run api:test:int`). Cubre PEPS y concurrencia del inventario, reglas de crédito, devoluciones (prorrateo de descuento y redondeo) y cancelaciones.

Estas pruebas encontraron y se corrigieron 7 errores más:

- Ventas a crédito simultáneas rebasaban el límite del cliente.
- Se podía devolver más de lo vendido repitiendo la partida o con devoluciones simultáneas.
- Por redondeo, la suma de notas de crédito podía superar el total cobrado (p. ej. $30.00 sobre $29.99).
- Devoluciones simultáneas en una venta a crédito dejaban mal el saldo.
- Cancelar dos veces, o cancelar y devolver a la vez, regresaba el producto dos veces al inventario.

## 4. Login y cabeceras

- Máximo 5 intentos fallidos por usuario+IP cada 15 minutos (`429` después).
- `helmet` para cabeceras de seguridad HTTP.

## 5. Fotos y firmas (pendiente)

Hoy viajan en base64 y se guardan como texto en `Delivery`/`Incident`. Propuesta: guardarlas en almacenamiento de objetos (S3, Cloudflare R2 o el disco del servidor) y dejar en la base solo la ruta. Requiere decidir el proveedor.

## 6. ESLint y Prettier (pendiente)

Configuración única en la raíz; aplicarla en un commit aparte para no mezclar formato con cambios de lógica.

## 7. Tipos compartidos (pendiente)

Crear `packages/shared` con los tipos y mensajes de error que hoy están copiados en `apps/driver/src/lib/types.ts`, `apps/web/src/lib/types.ts` y sus `errors.ts`.

## 8. Operación (pendiente)

- Respaldo diario de PostgreSQL (en Render viene con planes de pago; si no, `pg_dump` programado).
- Monitoreo de errores (p. ej. Sentry) en API y apps.
- Logs en JSON con `nestjs-pino`.
