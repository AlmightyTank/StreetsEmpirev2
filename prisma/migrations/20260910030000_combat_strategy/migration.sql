ALTER TYPE "ActivityType" ADD VALUE 'COMBAT_RECON';

CREATE TABLE "CombatIntel" (
    "id" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CombatIntel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CombatIntel_observerId_targetId_key" ON "CombatIntel"("observerId", "targetId");
CREATE INDEX "CombatIntel_observerId_expiresAt_idx" ON "CombatIntel"("observerId", "expiresAt");
CREATE INDEX "CombatIntel_targetId_idx" ON "CombatIntel"("targetId");

ALTER TABLE "CombatIntel" ADD CONSTRAINT "CombatIntel_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CombatIntel" ADD CONSTRAINT "CombatIntel_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
