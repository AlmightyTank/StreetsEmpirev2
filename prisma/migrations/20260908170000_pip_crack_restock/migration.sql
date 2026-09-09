-- Sections 32-33. Pip gets a counter too.
--
-- The one shelf meant to stop being enough: crack can also be cooked, so
-- unlike every other supply a limit here has an escape hatch. Pip carries a
-- player through the first half of a round; after that Produce Crack has to
-- become the main source.
--
-- Existing players start full, matching classic-og-v0.1.

ALTER TABLE "RoundPlayer"
  ADD COLUMN "crackStock"   INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "crackStockAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RoundPlayer" SET "crackStock" = 500;
