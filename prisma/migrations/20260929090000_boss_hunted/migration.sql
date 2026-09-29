-- Trips C. A boss away from home can be found and hit, and a beaten boss is laid up.
-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'BOSS_HIT';
ALTER TYPE "ActivityType" ADD VALUE 'BOSS_HIT_ATTACK';
ALTER TYPE "ActivityType" ADD VALUE 'BOSS_HIT_DEFENSE';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "laidUpUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BossTrip" ADD COLUMN     "lastHitAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ConvoyRecon" ADD COLUMN     "bossTargets" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "BossHit" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "squad" INTEGER NOT NULL,
    "turnsSpent" INTEGER NOT NULL,
    "actionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "landsAt" TIMESTAMP(3) NOT NULL,
    "status" "ConvoyTailStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "result" JSONB,
    "attackerCreditedAt" TIMESTAMP(3),

    CONSTRAINT "BossHit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BossHit_squad_positive" CHECK ("squad" > 0 AND "turnsSpent" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "BossHit_attackerId_actionId_key" ON "BossHit"("attackerId", "actionId");

-- CreateIndex
CREATE INDEX "BossHit_tripId_status_idx" ON "BossHit"("tripId", "status");

-- CreateIndex
CREATE INDEX "BossHit_status_landsAt_idx" ON "BossHit"("status", "landsAt");

-- CreateIndex
CREATE INDEX "BossHit_attackerId_attackerCreditedAt_idx" ON "BossHit"("attackerId", "attackerCreditedAt");

-- One hit waiting on a boss at a time.
CREATE UNIQUE INDEX "BossHit_one_pending_per_trip" ON "BossHit"("tripId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "BossHit" ADD CONSTRAINT "BossHit_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "BossTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BossHit" ADD CONSTRAINT "BossHit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BossHit" ADD CONSTRAINT "BossHit_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
