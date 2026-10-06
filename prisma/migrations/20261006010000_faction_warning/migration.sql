-- StreetsEmpire 1.4.0-D: Trusted faction warnings reach the bell, each once.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'FACTION_WARNING';

-- CreateTable
CREATE TABLE "PlayerFactionWarning" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "factionKey" TEXT NOT NULL,
    "warningKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerFactionWarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerFactionWarning_roundPlayerId_warningKey_key" ON "PlayerFactionWarning"("roundPlayerId", "warningKey");

-- AddForeignKey
ALTER TABLE "PlayerFactionWarning" ADD CONSTRAINT "PlayerFactionWarning_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
