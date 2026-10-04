-- Multiplayer Hold'em hand snapshots and idempotent player actions.
ALTER TABLE "CasinoPokerTable" ADD COLUMN "dealerSeatNo" INTEGER;

CREATE TABLE "CasinoPokerTableHand" (
  "id" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "handNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "state" JSONB NOT NULL,
  "outcome" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoPokerTableHand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CasinoPokerTableAction" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "handId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasinoPokerTableAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasinoPokerTableHand_tableId_handNo_key" ON "CasinoPokerTableHand"("tableId", "handNo");
CREATE INDEX "CasinoPokerTableHand_tableId_status_handNo_idx" ON "CasinoPokerTableHand"("tableId", "status", "handNo");
CREATE UNIQUE INDEX "CasinoPokerTableAction_roundPlayerId_actionId_key" ON "CasinoPokerTableAction"("roundPlayerId", "actionId");
CREATE INDEX "CasinoPokerTableAction_handId_createdAt_idx" ON "CasinoPokerTableAction"("handId", "createdAt");

ALTER TABLE "CasinoPokerTableHand" ADD CONSTRAINT "CasinoPokerTableHand_tableId_fkey"
FOREIGN KEY ("tableId") REFERENCES "CasinoPokerTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoPokerTableAction" ADD CONSTRAINT "CasinoPokerTableAction_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoPokerTableAction" ADD CONSTRAINT "CasinoPokerTableAction_handId_fkey"
FOREIGN KEY ("handId") REFERENCES "CasinoPokerTableHand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
