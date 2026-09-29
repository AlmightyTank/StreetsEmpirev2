-- Trips D2. Airport checks, outpost visits, ally backup for a boss, and sit-downs.
-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'BOSS_HIT_BACKUP';
ALTER TYPE "ActivityType" ADD VALUE 'OUTPOST_VISIT';
ALTER TYPE "ActivityType" ADD VALUE 'SIT_DOWN';
ALTER TYPE "ActivityType" ADD VALUE 'SIT_DOWN_AGREED';

-- CreateEnum
CREATE TYPE "SitDownStatus" AS ENUM ('PENDING', 'AGREED', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "BossTrip" ADD COLUMN     "airportDelayMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "airportSeizedCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "BossTrip" ADD CONSTRAINT "BossTrip_airport_nonnegative" CHECK ("airportDelayMinutes" >= 0 AND "airportSeizedCents" >= 0);

-- AlterTable
ALTER TABLE "BossHit" ADD COLUMN     "alliesCalledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TurfOutpost" ADD COLUMN     "moraleUntil" TIMESTAMP(3),
ADD COLUMN     "visitedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BossHitBackup" (
    "id" TEXT NOT NULL,
    "hitId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "thugs" INTEGER NOT NULL,
    "crew" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "wounded" INTEGER NOT NULL DEFAULT 0,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "BossHitBackup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BossHitBackup_thugs_check" CHECK ("thugs" > 0 AND "wounded" >= 0 AND "wounded" <= "thugs")
);

-- CreateTable
CREATE TABLE "SitDown" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" "SitDownStatus" NOT NULL DEFAULT 'PENDING',
    "proposedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "truceUntil" TIMESTAMP(3),

    CONSTRAINT "SitDown_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SitDown_two_bosses" CHECK ("proposerId" <> "inviteeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "BossHitBackup_hitId_playerId_key" ON "BossHitBackup"("hitId", "playerId");

-- CreateIndex
CREATE INDEX "BossHitBackup_playerId_creditedAt_idx" ON "BossHitBackup"("playerId", "creditedAt");

-- CreateIndex
CREATE INDEX "SitDown_proposerId_status_idx" ON "SitDown"("proposerId", "status");

-- CreateIndex
CREATE INDEX "SitDown_inviteeId_status_idx" ON "SitDown"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "SitDown_roundId_truceUntil_idx" ON "SitDown"("roundId", "truceUntil");

-- One open invitation between the same two bosses at a time.
CREATE UNIQUE INDEX "SitDown_one_pending_per_pair" ON "SitDown"("proposerId", "inviteeId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "BossHitBackup" ADD CONSTRAINT "BossHitBackup_hitId_fkey" FOREIGN KEY ("hitId") REFERENCES "BossHit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BossHitBackup" ADD CONSTRAINT "BossHitBackup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitDown" ADD CONSTRAINT "SitDown_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitDown" ADD CONSTRAINT "SitDown_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
