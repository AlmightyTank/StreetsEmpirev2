-- 0.5.0-E. Convoys: tails on runs, backup sent to their fights, thugs busy on either,
-- and escorts wounded on the road.

-- CreateEnum
CREATE TYPE "ConvoyTailStatus" AS ENUM ('PENDING', 'LANDED', 'ESCAPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'CONVOY_TAIL';
ALTER TYPE "ActivityType" ADD VALUE 'CONVOY_TAILED';
ALTER TYPE "ActivityType" ADD VALUE 'CONVOY_ATTACK';
ALTER TYPE "ActivityType" ADD VALUE 'CONVOY_DEFENSE';
ALTER TYPE "ActivityType" ADD VALUE 'CONVOY_BACKUP';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "busyThugs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "lastHitAt" TIMESTAMP(3),
ADD COLUMN     "woundedEscorts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ConvoyTail" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "attackerRunId" TEXT,
    "city" TEXT NOT NULL,
    "squad" INTEGER NOT NULL,
    "attackerCrew" JSONB NOT NULL,
    "turnsSpent" INTEGER NOT NULL,
    "actionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "landsAt" TIMESTAMP(3) NOT NULL,
    "status" "ConvoyTailStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "result" JSONB,
    "attackerCreditedAt" TIMESTAMP(3),
    "alliesCalledAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "ConvoyTail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvoyBackup" (
    "id" TEXT NOT NULL,
    "tailId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "thugs" INTEGER NOT NULL,
    "crew" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "wounded" INTEGER NOT NULL DEFAULT 0,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "ConvoyBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConvoyTail_runId_status_idx" ON "ConvoyTail"("runId", "status");

-- CreateIndex
CREATE INDEX "ConvoyTail_status_landsAt_idx" ON "ConvoyTail"("status", "landsAt");

-- CreateIndex
CREATE INDEX "ConvoyTail_attackerId_attackerCreditedAt_idx" ON "ConvoyTail"("attackerId", "attackerCreditedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConvoyTail_attackerId_actionId_key" ON "ConvoyTail"("attackerId", "actionId");

-- CreateIndex
CREATE INDEX "ConvoyBackup_playerId_creditedAt_idx" ON "ConvoyBackup"("playerId", "creditedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConvoyBackup_tailId_playerId_key" ON "ConvoyBackup"("tailId", "playerId");

-- AddForeignKey
ALTER TABLE "ConvoyTail" ADD CONSTRAINT "ConvoyTail_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyTail" ADD CONSTRAINT "ConvoyTail_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyTail" ADD CONSTRAINT "ConvoyTail_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyBackup" ADD CONSTRAINT "ConvoyBackup_tailId_fkey" FOREIGN KEY ("tailId") REFERENCES "ConvoyTail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyBackup" ADD CONSTRAINT "ConvoyBackup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Counts never go below zero; a tail commits someone; a run has at most one tail
-- waiting to land, and an attacker at most one squad out.
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_busyThugs_check" CHECK ("busyThugs" >= 0);
ALTER TABLE "Run" ADD CONSTRAINT "Run_woundedEscorts_check" CHECK ("woundedEscorts" >= 0 AND "woundedEscorts" <= "escortThugs");
ALTER TABLE "ConvoyTail" ADD CONSTRAINT "ConvoyTail_squad_check" CHECK ("squad" > 0 AND "turnsSpent" >= 0 AND "landsAt" >= "startedAt" AND "source" IN ('HOME', 'RUN'));
ALTER TABLE "ConvoyBackup" ADD CONSTRAINT "ConvoyBackup_thugs_check" CHECK ("thugs" > 0 AND "wounded" >= 0 AND "wounded" <= "thugs" AND "kind" IN ('OWNER', 'ALLY'));
CREATE UNIQUE INDEX "ConvoyTail_one_pending_per_run" ON "ConvoyTail"("runId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "ConvoyTail_one_pending_per_attacker" ON "ConvoyTail"("attackerId") WHERE "status" = 'PENDING';
