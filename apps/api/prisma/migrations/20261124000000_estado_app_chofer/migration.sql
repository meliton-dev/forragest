-- Estado que reporta la app del chofer: última conexión, registros guardados sin enviar, rechazados y GPS.
ALTER TABLE "Route" ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "pendingOps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "oldestPendingAt" TIMESTAMP(3),
ADD COLUMN "rejectedOps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "gpsStatus" TEXT;
