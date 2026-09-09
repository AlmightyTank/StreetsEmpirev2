-- Section 34. Tommy can only round up so much muscle in an hour.
--
-- Hiring is the one net-worth-neutral purchase, so without a shelf a late
-- round fortune would become an army in a single click. Existing players
-- start full, matching classic-og-v0.1.

ALTER TABLE "RoundPlayer"
  ADD COLUMN "thugStock"   INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "thugStockAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RoundPlayer" SET "thugStock" = 5;
