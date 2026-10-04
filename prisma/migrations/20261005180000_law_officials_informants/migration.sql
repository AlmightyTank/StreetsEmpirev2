-- StreetsEmpire 1.3.0-D: corrupt officials on the payroll with Internal Affairs exposure, and
-- informant tips.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'OFFICIAL_HIRED';
ALTER TYPE "ActivityType" ADD VALUE 'OFFICIAL_IA_OPENED';
ALTER TYPE "ActivityType" ADD VALUE 'OFFICIAL_CUT';
ALTER TYPE "ActivityType" ADD VALUE 'OFFICIAL_STUNG';
ALTER TYPE "ActivityType" ADD VALUE 'WARRANT_QUASHED';
ALTER TYPE "ActivityType" ADD VALUE 'CAPTAIN_TIP';
ALTER TYPE "ActivityType" ADD VALUE 'INFORMANT_TIP';

-- CreateTable
CREATE TABLE "PlayerOfficial" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hiredAt" TIMESTAMP(3) NOT NULL,
    "paidUntil" TIMESTAMP(3) NOT NULL,
    "exposure" INTEGER NOT NULL DEFAULT 0,
    "iaOpenedAt" TIMESTAMP(3),
    "stingAt" TIMESTAMP(3),
    "quashReadyAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "iaAlertedAt" TIMESTAMP(3),
    "stungAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerOfficial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTip" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cityId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerOfficial_status_stingAt_idx" ON "PlayerOfficial"("status", "stingAt");

-- CreateIndex
CREATE INDEX "PlayerOfficial_cityId_idx" ON "PlayerOfficial"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerOfficial_roundPlayerId_cityId_role_key" ON "PlayerOfficial"("roundPlayerId", "cityId", "role");

-- CreateIndex
CREATE INDEX "PlayerTip_roundPlayerId_createdAt_idx" ON "PlayerTip"("roundPlayerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlayerTip_cityId_idx" ON "PlayerTip"("cityId");

-- AddForeignKey
ALTER TABLE "PlayerOfficial" ADD CONSTRAINT "PlayerOfficial_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerOfficial" ADD CONSTRAINT "PlayerOfficial_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTip" ADD CONSTRAINT "PlayerTip_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTip" ADD CONSTRAINT "PlayerTip_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
