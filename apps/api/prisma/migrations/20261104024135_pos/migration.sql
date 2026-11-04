-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PAGADA', 'POR_COBRAR', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SalePayment" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('EFECTIVO', 'TARJETA', 'SALDO_A_FAVOR');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ABIERTO', 'CERRADO');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'ENTRADA_DEVOLUCION';

-- CreateTable
CREATE TABLE "CashShift" (
    "id" SERIAL NOT NULL,
    "register" TEXT NOT NULL DEFAULT 'Caja 1',
    "cashierId" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingFloat" DECIMAL(12,2) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'ABIERTO',
    "expectedCash" DECIMAL(12,2),
    "countedCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "denominations" JSONB,
    "notes" TEXT,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "folio" SERIAL NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "cashierId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "status" "SaleStatus" NOT NULL,
    "paymentMethod" "SalePayment" NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "received" DECIMAL(12,2),
    "change" DECIMAL(12,2),
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "discountAuthorizedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelAuthorizedById" INTEGER,
    "clientOpId" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "presentation" TEXT NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "costTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" SERIAL NOT NULL,
    "folio" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "refundMethod" "RefundMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "comments" TEXT,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" SERIAL NOT NULL,
    "creditNoteId" INTEGER NOT NULL,
    "saleItemId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_folio_key" ON "Sale"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientOpId_key" ON "Sale"("clientOpId");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_customerId_status_idx" ON "Sale"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_folio_key" ON "CreditNote"("folio");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
