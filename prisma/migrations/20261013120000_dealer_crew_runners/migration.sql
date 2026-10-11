-- 1.8.6-F: runners can auto-restock dealer crews while preserving a storage floor.
ALTER TABLE "DealerCrew" ADD COLUMN "runnerReserveUnits" INTEGER NOT NULL DEFAULT 0;
