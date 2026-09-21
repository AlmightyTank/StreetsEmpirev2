-- Add opt-in alert categories for personal turf losses and alliance city-control changes.
ALTER TABLE "NotificationSettings"
  ADD COLUMN "turfEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "turfEnabledAt" TIMESTAMP(3),
  ADD COLUMN "allianceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allianceEnabledAt" TIMESTAMP(3);
