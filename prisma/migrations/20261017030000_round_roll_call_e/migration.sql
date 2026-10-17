-- Slice E: source-aware stamps and tamper-evident bounded self-service recoveries.
-- Existing rows are real LOGIN stamps, not retroactive catch-up credits.
ALTER TABLE "RoundLoginCheckIn" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'LOGIN';

CREATE TABLE "RoundLoginRecovery" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "dayIndex" INTEGER NOT NULL,
  "actionId" TEXT NOT NULL,
  "actorAccountId" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'SELF_SERVICE',
  "stampsBefore" INTEGER NOT NULL,
  "missedBefore" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoundLoginRecovery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoundLoginRecovery_roundPlayerId_dayIndex_key" ON "RoundLoginRecovery"("roundPlayerId","dayIndex");
CREATE UNIQUE INDEX "RoundLoginRecovery_roundPlayerId_actionId_key" ON "RoundLoginRecovery"("roundPlayerId","actionId");
CREATE INDEX "RoundLoginRecovery_roundPlayerId_createdAt_idx" ON "RoundLoginRecovery"("roundPlayerId","createdAt");
ALTER TABLE "RoundLoginRecovery" ADD CONSTRAINT "RoundLoginRecovery_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
