-- 1.5.0-B. Add separately owned Sedan and Van counts. Existing Low-Riders remain
-- in RoundPlayer.lowRiders, and every existing active run is explicitly a Low-Rider run.
ALTER TABLE "RoundPlayer"
  ADD COLUMN "sedans" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vans" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RoundPlayer"
  ADD CONSTRAINT "RoundPlayer_vehicle_counts_check" CHECK ("sedans" >= 0 AND "vans" >= 0) NOT VALID;

ALTER TABLE "Run"
  ADD COLUMN "vehicleLoadout" JSONB NOT NULL DEFAULT '{"LOW_RIDER":1}'::jsonb;

UPDATE "Run" SET "vehicleLoadout" = jsonb_build_object('LOW_RIDER', "lowRiders");

ALTER TABLE "Run"
  ADD CONSTRAINT "Run_vehicle_loadout_object_check" CHECK (jsonb_typeof("vehicleLoadout") = 'object') NOT VALID;
