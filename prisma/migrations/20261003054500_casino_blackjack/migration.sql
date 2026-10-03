-- StreetsEmpire 1.2.0-C: reconnect-safe Blackjack.

CREATE TABLE "CasinoBlackjackShoe" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "cards" JSONB NOT NULL,
  "cursor" INTEGER NOT NULL DEFAULT 0,
  "shuffleNumber" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoBlackjackShoe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CasinoBlackjackShoe_roundPlayerId_tableKey_key" ON "CasinoBlackjackShoe"("roundPlayerId", "tableKey");
CREATE INDEX "CasinoBlackjackShoe_tableKey_idx" ON "CasinoBlackjackShoe"("tableKey");
ALTER TABLE "CasinoBlackjackShoe"
  ADD CONSTRAINT "CasinoBlackjackShoe_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CasinoBlackjackHand" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "wagerCents" BIGINT NOT NULL,
  "playerHands" JSONB NOT NULL,
  "dealerCards" JSONB NOT NULL,
  "activeHandIndex" INTEGER NOT NULL DEFAULT 0,
  "totalReturnCents" BIGINT NOT NULL DEFAULT 0,
  "bankrollAfterCents" BIGINT NOT NULL DEFAULT 0,
  "initialActionId" TEXT NOT NULL,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoBlackjackHand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CasinoBlackjackHand_roundPlayerId_initialActionId_key" ON "CasinoBlackjackHand"("roundPlayerId", "initialActionId");
CREATE INDEX "CasinoBlackjackHand_roundPlayerId_status_createdAt_idx" ON "CasinoBlackjackHand"("roundPlayerId", "status", "createdAt" DESC);
CREATE INDEX "CasinoBlackjackHand_sessionId_status_idx" ON "CasinoBlackjackHand"("sessionId", "status");
CREATE INDEX "CasinoBlackjackHand_cityId_createdAt_idx" ON "CasinoBlackjackHand"("cityId", "createdAt" DESC);
ALTER TABLE "CasinoBlackjackHand"
  ADD CONSTRAINT "CasinoBlackjackHand_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CasinoBlackjackAction" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "handId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasinoBlackjackAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CasinoBlackjackAction_roundPlayerId_actionId_key" ON "CasinoBlackjackAction"("roundPlayerId", "actionId");
CREATE INDEX "CasinoBlackjackAction_handId_createdAt_idx" ON "CasinoBlackjackAction"("handId", "createdAt");
ALTER TABLE "CasinoBlackjackAction"
  ADD CONSTRAINT "CasinoBlackjackAction_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
