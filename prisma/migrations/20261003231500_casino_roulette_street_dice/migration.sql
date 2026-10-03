-- 1.2.0-D: reconnect-safe Street Dice rounds and action receipts.

CREATE TABLE "CasinoStreetDiceRound" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lineWagerCents" BIGINT NOT NULL,
    "oddsWagerCents" BIGINT NOT NULL DEFAULT 0,
    "point" INTEGER,
    "lastDice" JSONB NOT NULL DEFAULT '[]',
    "lastOutcome" TEXT,
    "rollCount" INTEGER NOT NULL DEFAULT 0,
    "totalReturnCents" BIGINT NOT NULL DEFAULT 0,
    "bankrollAfterCents" BIGINT NOT NULL DEFAULT 0,
    "initialActionId" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CasinoStreetDiceRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CasinoStreetDiceAction" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "diceRoundId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CasinoStreetDiceAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasinoStreetDiceRound_roundPlayerId_initialActionId_key"
ON "CasinoStreetDiceRound"("roundPlayerId", "initialActionId");

CREATE INDEX "CasinoStreetDiceRound_roundPlayerId_status_createdAt_idx"
ON "CasinoStreetDiceRound"("roundPlayerId", "status", "createdAt" DESC);

CREATE INDEX "CasinoStreetDiceRound_sessionId_status_idx"
ON "CasinoStreetDiceRound"("sessionId", "status");

CREATE INDEX "CasinoStreetDiceRound_cityId_createdAt_idx"
ON "CasinoStreetDiceRound"("cityId", "createdAt" DESC);

CREATE UNIQUE INDEX "CasinoStreetDiceAction_roundPlayerId_actionId_key"
ON "CasinoStreetDiceAction"("roundPlayerId", "actionId");

CREATE INDEX "CasinoStreetDiceAction_diceRoundId_createdAt_idx"
ON "CasinoStreetDiceAction"("diceRoundId", "createdAt");

ALTER TABLE "CasinoStreetDiceRound"
ADD CONSTRAINT "CasinoStreetDiceRound_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CasinoStreetDiceAction"
ADD CONSTRAINT "CasinoStreetDiceAction_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
