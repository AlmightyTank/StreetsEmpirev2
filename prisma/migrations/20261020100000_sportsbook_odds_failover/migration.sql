-- Slice C: sticky per-league odds providers and provider circuit-breaker health.
ALTER TABLE "SportsbookProviderState"
ADD COLUMN "consecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
ADD COLUMN "circuitOpenUntil" TIMESTAMP(3);

CREATE TABLE "SportsbookLeagueProviderState" (
    "league" TEXT NOT NULL,
    "activeOddsProvider" TEXT NOT NULL DEFAULT 'therundown',
    "activeSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedOddsProvider" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsbookLeagueProviderState_pkey" PRIMARY KEY ("league")
);

INSERT INTO "SportsbookLeagueProviderState" (
    "league", "activeOddsProvider", "activeSince", "updatedAt"
)
VALUES
    ('NFL', 'therundown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NBA', 'therundown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('MLB', 'therundown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NHL', 'therundown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE INDEX "SportsbookLeagueProviderState_activeOddsProvider_idx"
ON "SportsbookLeagueProviderState"("activeOddsProvider");
