-- StreetsEmpire 1.4.0-B: seasonal faction standing, with an immutable receipt for every change.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'FACTION_TIER_UP';

-- CreateTable
CREATE TABLE "PlayerFactionStanding" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "factionKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerFactionStanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerFactionReceipt" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "factionKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "pointsAfter" INTEGER NOT NULL,
    "tierAfter" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerFactionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerFactionStanding_roundPlayerId_factionKey_key" ON "PlayerFactionStanding"("roundPlayerId", "factionKey");

-- CreateIndex
CREATE INDEX "PlayerFactionReceipt_roundPlayerId_factionKey_createdAt_idx" ON "PlayerFactionReceipt"("roundPlayerId", "factionKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerFactionReceipt_roundPlayerId_sourceKey_key" ON "PlayerFactionReceipt"("roundPlayerId", "sourceKey");

-- AddForeignKey
ALTER TABLE "PlayerFactionStanding" ADD CONSTRAINT "PlayerFactionStanding_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerFactionReceipt" ADD CONSTRAINT "PlayerFactionReceipt_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
