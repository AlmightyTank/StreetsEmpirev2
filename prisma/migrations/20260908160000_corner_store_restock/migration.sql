-- Sections 32-33. The corner store gets a shelf too, but a deep one.
--
-- Supplies are upkeep, so these limits exist to stop one click solving supply
-- for a whole round - not to ration a working crew. The caps below are several
-- days of consumption for an empire well past the ruleset's soft caps.
--
-- Existing players start full, matching classic-og-v0.1.

ALTER TABLE "RoundPlayer"
  ADD COLUMN "condomStock"     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "condomStockAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "medicineStock"   INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "medicineStockAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "beerStock"       INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "beerStockAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RoundPlayer"
SET "condomStock"   = 20000,
    "medicineStock" = 500,
    "beerStock"     = 5000;
