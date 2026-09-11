ALTER TABLE "RoundPlayer" ADD COLUMN "woundedThugs" INTEGER NOT NULL DEFAULT 0;

ALTER TYPE "ActivityType" ADD VALUE 'COMBAT_TREATMENT';

CREATE TABLE "CombatInjury" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "battleId" TEXT,
    "thugs" INTEGER NOT NULL,
    "recoverAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "treatedAt" TIMESTAMP(3),

    CONSTRAINT "CombatInjury_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CombatInjury_roundPlayerId_recoverAt_idx" ON "CombatInjury"("roundPlayerId", "recoverAt");
CREATE INDEX "CombatInjury_battleId_idx" ON "CombatInjury"("battleId");

ALTER TABLE "CombatInjury" ADD CONSTRAINT "CombatInjury_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CombatInjury" ADD CONSTRAINT "CombatInjury_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "RaidBattle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
