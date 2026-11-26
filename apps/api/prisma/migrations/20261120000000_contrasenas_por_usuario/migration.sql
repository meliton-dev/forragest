-- Cada usuario elige su propia contraseña. Antes todos compartían una (la del seed).
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Todos los usuarios que ya existen (producción) deben elegir su contraseña al entrar.
UPDATE "User" SET "mustChangePassword" = true;
