-- StreetsEmpire 1.3.0-C: warrants and their alert markers, business racket shutdowns, the daily
-- police-loss cap and lawyers on retainer.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'WARRANT_DRAFTED';
ALTER TYPE "ActivityType" ADD VALUE 'WARRANT_SERVED';
ALTER TYPE "ActivityType" ADD VALUE 'WARRANT_LAWYERED';
ALTER TYPE "ActivityType" ADD VALUE 'LAWYER_RETAINED';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "racketShutFrom" TIMESTAMP(3),
ADD COLUMN     "racketShutUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "lawyerRetainedUntil" TIMESTAMP(3),
ADD COLUMN     "policeLossCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "policeLossDay" TEXT;

-- CreateTable
CREATE TABLE "PlayerWarrant" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "businessId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "draftedAt" TIMESTAMP(3) NOT NULL,
    "servesAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "outcome" JSONB NOT NULL DEFAULT '{}',
    "draftAlertedAt" TIMESTAMP(3),
    "waitingAlertedAt" TIMESTAMP(3),
    "resolvedAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerWarrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerWarrant_roundPlayerId_status_idx" ON "PlayerWarrant"("roundPlayerId", "status");

-- CreateIndex
CREATE INDEX "PlayerWarrant_status_servesAt_idx" ON "PlayerWarrant"("status", "servesAt");

-- CreateIndex
CREATE INDEX "PlayerWarrant_cityId_idx" ON "PlayerWarrant"("cityId");

-- CreateIndex
CREATE INDEX "PlayerWarrant_businessId_idx" ON "PlayerWarrant"("businessId");

-- AddForeignKey
ALTER TABLE "PlayerWarrant" ADD CONSTRAINT "PlayerWarrant_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWarrant" ADD CONSTRAINT "PlayerWarrant_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWarrant" ADD CONSTRAINT "PlayerWarrant_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
