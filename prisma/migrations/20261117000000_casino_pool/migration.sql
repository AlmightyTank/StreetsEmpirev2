-- Pool: shot-by-shot eight-ball against house hustlers.

CREATE TABLE "CasinoPoolGame" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "wagerCents" BIGINT NOT NULL,
  "committedWagerCents" BIGINT NOT NULL,
  "pressed" BOOLEAN NOT NULL DEFAULT false,
  "rack" JSONB NOT NULL,
  "totalReturnCents" BIGINT NOT NULL DEFAULT 0,
  "bankrollAfterCents" BIGINT NOT NULL DEFAULT 0,
  "initialActionId" TEXT NOT NULL,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoPoolGame_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CasinoPoolGame_roundPlayerId_initialActionId_key" ON "CasinoPoolGame"("roundPlayerId", "initialActionId");
CREATE INDEX "CasinoPoolGame_roundPlayerId_status_createdAt_idx" ON "CasinoPoolGame"("roundPlayerId", "status", "createdAt" DESC);
CREATE INDEX "CasinoPoolGame_sessionId_status_idx" ON "CasinoPoolGame"("sessionId", "status");
CREATE INDEX "CasinoPoolGame_cityId_createdAt_idx" ON "CasinoPoolGame"("cityId", "createdAt" DESC);
ALTER TABLE "CasinoPoolGame"
  ADD CONSTRAINT "CasinoPoolGame_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CasinoPoolAction" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasinoPoolAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CasinoPoolAction_roundPlayerId_actionId_key" ON "CasinoPoolAction"("roundPlayerId", "actionId");
CREATE INDEX "CasinoPoolAction_gameId_createdAt_idx" ON "CasinoPoolAction"("gameId", "createdAt");
ALTER TABLE "CasinoPoolAction"
  ADD CONSTRAINT "CasinoPoolAction_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
