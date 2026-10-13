-- Slice B: keep one canonical event while preserving each provider's listing and attribution.
ALTER TABLE "SportsbookEvent"
ADD COLUMN "oddsProvider" TEXT NOT NULL DEFAULT 'therundown',
ADD COLUMN "settledProvider" TEXT NOT NULL DEFAULT '';

ALTER TABLE "SportsbookBet"
ADD COLUMN "oddsProvider" TEXT NOT NULL DEFAULT 'therundown';

ALTER TABLE "SportsbookFeedRun"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'therundown';

CREATE TABLE "SportsbookEventSource" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRE',
    "homeOdds" INTEGER,
    "awayOdds" INTEGER,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultCheckCount" INTEGER NOT NULL DEFAULT 0,
    "resultCheckedAt" TIMESTAMP(3),
    "nextResultCheckAt" TIMESTAMP(3),
    "resultError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsbookEventSource_pkey" PRIMARY KEY ("id")
);

-- Existing events all came from TheRundown. Deterministic ids keep the backfill repeatable.
INSERT INTO "SportsbookEventSource" (
    "id", "eventId", "provider", "providerEventId", "status", "homeOdds", "awayOdds",
    "homeScore", "awayScore", "lastSeenAt", "resultCheckCount", "resultCheckedAt",
    "nextResultCheckAt", "resultError", "createdAt", "updatedAt"
)
SELECT
    'src_' || md5("id" || ':therundown'), "id", 'therundown', "providerEventId",
    CASE WHEN "status" = 'VOID' THEN 'CANCELLED' WHEN "status" = 'PULLED' THEN 'PRE' ELSE "status" END,
    "homeOdds", "awayOdds", "homeScore", "awayScore", "lastSeenAt", "resultCheckCount",
    "resultCheckedAt", "nextResultCheckAt", "resultError", "createdAt", CURRENT_TIMESTAMP
FROM "SportsbookEvent";

UPDATE "SportsbookEvent"
SET "settledProvider" = 'therundown'
WHERE "settledAt" IS NOT NULL AND "settledVia" IN ('FEED', 'ADMIN_RECHECK');

CREATE UNIQUE INDEX "SportsbookEventSource_provider_providerEventId_key"
ON "SportsbookEventSource"("provider", "providerEventId");

CREATE INDEX "SportsbookEventSource_provider_nextResultCheckAt_idx"
ON "SportsbookEventSource"("provider", "nextResultCheckAt");

CREATE INDEX "SportsbookEventSource_eventId_idx"
ON "SportsbookEventSource"("eventId");

ALTER TABLE "SportsbookEventSource"
ADD CONSTRAINT "SportsbookEventSource_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "SportsbookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
