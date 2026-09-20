-- 0.6.0-C Turf wars: durable delayed pushes and committed backup.

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_PUSH';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_PUSH_BACKUP';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_PUSH_ATTACK';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_PUSH_DEFENSE';

CREATE TYPE "TurfPushStatus" AS ENUM ('PENDING', 'LANDED');

CREATE TABLE "TurfPush" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "turfId" TEXT NOT NULL,
  "attackerId" TEXT NOT NULL,
  "defenderId" TEXT NOT NULL,
  "squad" INTEGER NOT NULL,
  "attackerCrew" JSONB NOT NULL,
  "turnsSpent" INTEGER NOT NULL,
  "actionId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "landsAt" TIMESTAMP(3) NOT NULL,
  "status" "TurfPushStatus" NOT NULL DEFAULT 'PENDING',
  "settledAt" TIMESTAMP(3),
  "result" JSONB,
  "attackerCreditedAt" TIMESTAMP(3),
  "alliesCalledAt" TIMESTAMP(3),
  CONSTRAINT "TurfPush_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TurfPushBackup" (
  "id" TEXT NOT NULL,
  "pushId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "thugs" INTEGER NOT NULL,
  "crew" JSONB NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "showedUp" BOOLEAN,
  "wounded" INTEGER NOT NULL DEFAULT 0,
  "creditedAt" TIMESTAMP(3),
  CONSTRAINT "TurfPushBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TurfPush_attackerId_actionId_key" ON "TurfPush"("attackerId", "actionId");
CREATE INDEX "TurfPush_turfId_status_idx" ON "TurfPush"("turfId", "status");
CREATE INDEX "TurfPush_roundId_status_landsAt_idx" ON "TurfPush"("roundId", "status", "landsAt");
CREATE INDEX "TurfPush_attackerId_turfId_startedAt_idx" ON "TurfPush"("attackerId", "turfId", "startedAt" DESC);
CREATE INDEX "TurfPush_attackerId_attackerCreditedAt_idx" ON "TurfPush"("attackerId", "attackerCreditedAt");
CREATE UNIQUE INDEX "TurfPushBackup_pushId_playerId_key" ON "TurfPushBackup"("pushId", "playerId");
CREATE INDEX "TurfPushBackup_playerId_creditedAt_idx" ON "TurfPushBackup"("playerId", "creditedAt");

ALTER TABLE "TurfPush" ADD CONSTRAINT "TurfPush_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfPush" ADD CONSTRAINT "TurfPush_turfId_fkey"
  FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfPush" ADD CONSTRAINT "TurfPush_attackerId_fkey"
  FOREIGN KEY ("attackerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfPush" ADD CONSTRAINT "TurfPush_defenderId_fkey"
  FOREIGN KEY ("defenderId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfPushBackup" ADD CONSTRAINT "TurfPushBackup_pushId_fkey"
  FOREIGN KEY ("pushId") REFERENCES "TurfPush"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfPushBackup" ADD CONSTRAINT "TurfPushBackup_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
