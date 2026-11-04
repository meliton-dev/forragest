-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "plannedDeparture" TEXT;

-- AlterTable
ALTER TABLE "RouteStop" ADD COLUMN     "arrivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" SERIAL NOT NULL,
    "routeId" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationPing_routeId_recordedAt_idx" ON "LocationPing"("routeId", "recordedAt");

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
