ALTER TABLE "RoundPlayer" ADD COLUMN "raidProtectedUntil" TIMESTAMP(3),
  ADD COLUMN "raidCooldownUntil" TIMESTAMP(3), ADD COLUMN "lastRaidedAt" TIMESTAMP(3);
ALTER TYPE "ActivityType" ADD VALUE 'RAID_ATTACK';
ALTER TYPE "ActivityType" ADD VALUE 'RAID_DEFENSE';
CREATE TABLE "RaidBattle" (
  "id" TEXT NOT NULL, "attackerId" TEXT NOT NULL, "defenderId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL, "attackingThugs" INTEGER NOT NULL,
  "modelVersion" TEXT NOT NULL, "calculation" JSONB NOT NULL,
  "attackerReport" JSONB NOT NULL, "defenderReport" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RaidBattle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RaidBattle_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RaidBattle_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RaidBattle_attackerId_actionId_key" ON "RaidBattle"("attackerId", "actionId");
CREATE INDEX "RaidBattle_attackerId_createdAt_id_idx" ON "RaidBattle"("attackerId", "createdAt" DESC, "id");
CREATE INDEX "RaidBattle_defenderId_createdAt_id_idx" ON "RaidBattle"("defenderId", "createdAt" DESC, "id");
