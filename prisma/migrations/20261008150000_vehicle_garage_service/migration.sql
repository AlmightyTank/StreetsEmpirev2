-- 1.5.0-C. Vehicles at home that need the garage before they can roll again.
-- Ready vehicles stay in lowRiders/sedans/vans; these counts sit beside them.
ALTER TABLE "RoundPlayer"
  ADD COLUMN "damagedLowRiders" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "damagedSedans" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "damagedVans" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disabledLowRiders" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disabledSedans" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disabledVans" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RoundPlayer"
  ADD CONSTRAINT "RoundPlayer_vehicle_service_counts_check" CHECK (
    "damagedLowRiders" >= 0 AND "damagedSedans" >= 0 AND "damagedVans" >= 0
    AND "disabledLowRiders" >= 0 AND "disabledSedans" >= 0 AND "disabledVans" >= 0
  ) NOT VALID;

-- Which of a run's vehicles come home Damaged or Disabled. Every existing run is clean.
ALTER TABLE "Run"
  ADD COLUMN "vehicleDamage" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "Run"
  ADD CONSTRAINT "Run_vehicle_damage_object_check" CHECK (jsonb_typeof("vehicleDamage") = 'object') NOT VALID;
