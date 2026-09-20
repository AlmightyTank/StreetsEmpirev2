-- 0.6.0-D: runs can carry beer to outposts; outpost actions get their own activity rows.
ALTER TABLE "Run"
  ADD COLUMN "beer" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "startBeer" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RoundPlayer"
  ADD COLUMN "outpostNetWorthCents" BIGINT NOT NULL DEFAULT 0;

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_OUTPOST_ESTABLISH';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_OUTPOST_TRANSFER';
