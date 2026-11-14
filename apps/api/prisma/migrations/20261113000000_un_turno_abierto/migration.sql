-- Un cajero no puede tener dos turnos abiertos a la vez (dos aperturas simultáneas pasaban la comprobación de la aplicación).
-- Si ya hubiera duplicados, se conserva el más reciente y los demás se cierran sin conteo, con una nota, para que el índice pueda crearse.
UPDATE "CashShift" s
SET "status" = 'CERRADO',
    "closedAt" = NOW(),
    "notes" = COALESCE(s."notes" || ' · ', '') || 'Cerrado automáticamente: turno duplicado'
WHERE s."status" = 'ABIERTO'
  AND EXISTS (
    SELECT 1 FROM "CashShift" n
    WHERE n."cashierId" = s."cashierId" AND n."status" = 'ABIERTO' AND n."id" > s."id"
  );

CREATE UNIQUE INDEX "CashShift_cashierId_open_key" ON "CashShift"("cashierId") WHERE "status" = 'ABIERTO';
