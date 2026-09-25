-- Add opt-in alert categories for personal turf losses and alliance city-control changes.
ALTER TABLE "NotificationSettings"
  ADD COLUMN "turfEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "turfEnabledAt" TIMESTAMP(3),
  ADD COLUMN "allianceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allianceEnabledAt" TIMESTAMP(3);

-- Keep alert collection independent from the existing public Discord feed claim.
ALTER TABLE "TurfPush"
  ADD COLUMN "alertsCollectedAt" TIMESTAMP(3);

ALTER TABLE "TurfControlEvent"
  ADD COLUMN "alertsCollectedAt" TIMESTAMP(3);

CREATE INDEX "TurfPush_alertsCollectedAt_settledAt_idx"
  ON "TurfPush"("alertsCollectedAt", "settledAt");

CREATE INDEX "TurfControlEvent_alertsCollectedAt_happenedAt_idx"
  ON "TurfControlEvent"("alertsCollectedAt", "happenedAt");
