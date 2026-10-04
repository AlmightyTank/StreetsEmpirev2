-- 1.2.0-E: persisted solo Texas Hold'em hands and idempotent action receipts.
CREATE TABLE "CasinoPokerHand" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "buyInCents" BIGINT NOT NULL,
  "state" JSONB NOT NULL,
  "bankrollAfterCents" BIGINT NOT NULL,
  "initialActionId" TEXT NOT NULL,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoPokerHand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CasinoPokerAction" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "handId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasinoPokerAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasinoPokerHand_roundPlayerId_initialActionId_key"
ON "CasinoPokerHand"("roundPlayerId", "initialActionId");
CREATE INDEX "CasinoPokerHand_roundPlayerId_status_createdAt_idx"
ON "CasinoPokerHand"("roundPlayerId", "status", "createdAt" DESC);
CREATE INDEX "CasinoPokerHand_sessionId_status_idx" ON "CasinoPokerHand"("sessionId", "status");
CREATE INDEX "CasinoPokerHand_cityId_createdAt_idx" ON "CasinoPokerHand"("cityId", "createdAt" DESC);
CREATE UNIQUE INDEX "CasinoPokerAction_roundPlayerId_actionId_key"
ON "CasinoPokerAction"("roundPlayerId", "actionId");
CREATE INDEX "CasinoPokerAction_handId_createdAt_idx" ON "CasinoPokerAction"("handId", "createdAt");

ALTER TABLE "CasinoPokerHand" ADD CONSTRAINT "CasinoPokerHand_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoPokerAction" ADD CONSTRAINT "CasinoPokerAction_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
