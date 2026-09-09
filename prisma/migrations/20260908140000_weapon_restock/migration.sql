-- Section 34. Tommy is limited by supply, not only by price.
--
-- Each weapon gets a shelf count and the clock that shelf refills on, in the
-- same lazy-regeneration shape as turns: the counter only moves when the
-- player is looked at, and the clock advances by whole intervals.
--
-- Existing players are given a full shelf rather than an empty one - the caps
-- are small, and starting everyone at zero would silently take the hardware
-- away from anyone mid-round. The defaults below match classic-og-v0.1; a
-- ruleset with different caps settles to its own on the next look.

ALTER TABLE "RoundPlayer"
  ADD COLUMN "pistolStock"    INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "pistolStockAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "shotgunStock"   INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "shotgunStockAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "tek9Stock"      INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "tek9StockAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "ak47Stock"      INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "ak47StockAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RoundPlayer"
SET "shotgunStock" = 5,
    "tek9Stock"    = 3,
    "ak47Stock"    = 2;
