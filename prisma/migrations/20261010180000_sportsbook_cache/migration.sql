CREATE TABLE "SportsbookEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRE',
    "homeOdds" INTEGER,
    "awayOdds" INTEGER,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "oddsUpdatedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SportsbookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SportsbookProviderState" (
    "id" TEXT NOT NULL DEFAULT 'therundown',
    "lastPolledAt" TIMESTAMP(3),
    "lastDatapoints" INTEGER NOT NULL DEFAULT 0,
    "datapointsUsed" INTEGER NOT NULL DEFAULT 0,
    "datapointsLimit" INTEGER NOT NULL DEFAULT 0,
    "datapointsRemaining" INTEGER,
    "datapointsPeriod" TEXT NOT NULL DEFAULT '',
    "quotaObservedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SportsbookProviderState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SportsbookBet" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "oddsAmerican" INTEGER NOT NULL,
    "stakeCents" BIGINT NOT NULL,
    "payoutCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SportsbookBet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SportsbookEvent_providerEventId_key" ON "SportsbookEvent"("providerEventId");
CREATE INDEX "SportsbookEvent_sport_startsAt_status_idx" ON "SportsbookEvent"("sport", "startsAt", "status");
CREATE INDEX "SportsbookEvent_status_settledAt_idx" ON "SportsbookEvent"("status", "settledAt");
CREATE UNIQUE INDEX "SportsbookBet_roundPlayerId_actionId_key" ON "SportsbookBet"("roundPlayerId", "actionId");
CREATE INDEX "SportsbookBet_roundPlayerId_createdAt_idx" ON "SportsbookBet"("roundPlayerId", "createdAt" DESC);
CREATE INDEX "SportsbookBet_eventId_status_idx" ON "SportsbookBet"("eventId", "status");

ALTER TABLE "SportsbookBet" ADD CONSTRAINT "SportsbookBet_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SportsbookBet" ADD CONSTRAINT "SportsbookBet_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "SportsbookEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
