ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SPORTSBOOK_GAME_STARTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SPORTSBOOK_TICKET_SETTLED';

ALTER TABLE "SportsbookBet"
  ADD COLUMN "startedNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "settlementNotifiedAt" TIMESTAMP(3);

CREATE INDEX "SportsbookBet_status_startedNotifiedAt_idx" ON "SportsbookBet"("status", "startedNotifiedAt");
