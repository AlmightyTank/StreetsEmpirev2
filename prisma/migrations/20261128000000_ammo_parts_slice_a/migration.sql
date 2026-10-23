-- 2.4.0-B Slice A: durable balances and per-player store restock clocks.
-- Defaults keep existing players and rounds unchanged until a later ruleset opts in.
ALTER TABLE "RoundPlayer"
  ADD COLUMN "ammo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vehicleParts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ammoStock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ammoStockAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "vehiclePartsStock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vehiclePartsStockAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
