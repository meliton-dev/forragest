DROP INDEX "LocationPing_routeId_recordedAt_idx";

CREATE UNIQUE INDEX "LocationPing_routeId_recordedAt_key" ON "LocationPing"("routeId", "recordedAt");
