-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'HIDEOUT_BUILD_COMPLETE';
ALTER TYPE "ActivityType" ADD VALUE 'HIDEOUT_ROOM_READY';
ALTER TYPE "ActivityType" ADD VALUE 'COSMETIC_UNLOCKED';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN "hideoutBuildRoom" TEXT,
ADD COLUMN "hideoutBuildLevel" INTEGER,
ADD COLUMN "hideoutBuildStartedAt" TIMESTAMP(3),
ADD COLUMN "hideoutBuildReadyAt" TIMESTAMP(3),
ADD COLUMN "hideoutReadyAlerts" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "cosmeticsAlertedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RoundPlayer_hideoutBuildReadyAt_idx" ON "RoundPlayer"("hideoutBuildReadyAt");
