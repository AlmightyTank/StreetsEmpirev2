-- A pickup assignment can keep one fleet on the road for several consecutive loads.
ALTER TABLE "SupplyPickup"
  ADD COLUMN "loadStopOrder" INTEGER,
  ADD COLUMN "unloadStopOrder" INTEGER,
  ADD COLUMN "tripNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "tripCount" INTEGER NOT NULL DEFAULT 1;
