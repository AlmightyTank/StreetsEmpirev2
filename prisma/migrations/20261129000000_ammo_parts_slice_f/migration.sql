-- 2.4.0-F: resource toll receipts are durable and count toward their daily caps.
ALTER TABLE "TerritoryTollPayment"
  ADD COLUMN "chargedAmmo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "chargedVehicleParts" INTEGER NOT NULL DEFAULT 0;

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'AMMO_LOW';
