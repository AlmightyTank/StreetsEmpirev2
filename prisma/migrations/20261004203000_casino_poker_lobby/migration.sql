-- 1.2.0-F: persisted multiplayer Hold'em lobby tables and escrowed seats.
CREATE TABLE "CasinoPokerTable" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "inviteCodeHash" TEXT,
  "creatorRoundPlayerId" TEXT NOT NULL,
  "createActionId" TEXT NOT NULL,
  "maxPlayers" INTEGER NOT NULL DEFAULT 6,
  "buyInCents" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoPokerTable_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CasinoPokerSeat" (
  "id" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "seatNo" INTEGER NOT NULL,
  "stackCents" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "CasinoPokerSeat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CasinoPokerTable_roundId_status_visibility_createdAt_idx" ON "CasinoPokerTable"("roundId", "status", "visibility", "createdAt");
CREATE INDEX "CasinoPokerTable_cityId_status_idx" ON "CasinoPokerTable"("cityId", "status");
CREATE UNIQUE INDEX "CasinoPokerTable_creatorRoundPlayerId_createActionId_key" ON "CasinoPokerTable"("creatorRoundPlayerId", "createActionId");
CREATE UNIQUE INDEX "CasinoPokerSeat_tableId_seatNo_key" ON "CasinoPokerSeat"("tableId", "seatNo");
CREATE UNIQUE INDEX "CasinoPokerSeat_roundPlayerId_actionId_key" ON "CasinoPokerSeat"("roundPlayerId", "actionId");
CREATE INDEX "CasinoPokerSeat_roundPlayerId_status_idx" ON "CasinoPokerSeat"("roundPlayerId", "status");
CREATE INDEX "CasinoPokerSeat_tableId_status_seatNo_idx" ON "CasinoPokerSeat"("tableId", "status", "seatNo");
ALTER TABLE "CasinoPokerTable" ADD CONSTRAINT "CasinoPokerTable_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoPokerSeat" ADD CONSTRAINT "CasinoPokerSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CasinoPokerTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoPokerSeat" ADD CONSTRAINT "CasinoPokerSeat_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
