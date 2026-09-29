-- 1.0.0-E. Administration: season pause, bans, exploit flags, broadcast news and maintenance notices.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'GAME_ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "bannedByUsername" TEXT,
ADD COLUMN     "bannedReason" TEXT;

-- AlterTable
ALTER TABLE "GameNews" ADD COLUMN     "broadcast" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "broadcastAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedByUsername" TEXT,
ADD COLUMN     "pausedMinutesTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SiteBanner" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'notice',
ADD COLUMN     "maintenanceEndsAt" TIMESTAMP(3),
ADD COLUMN     "maintenanceStartsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExploitFlag" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "accountId" TEXT,
    "roundPlayerId" TEXT,
    "roundId" TEXT,
    "route" TEXT,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUsername" TEXT,
    "resolution" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "ExploitFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExploitFlag_fingerprint_key" ON "ExploitFlag"("fingerprint");

-- CreateIndex
CREATE INDEX "ExploitFlag_reviewedAt_lastSeenAt_idx" ON "ExploitFlag"("reviewedAt", "lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "ExploitFlag_accountId_lastSeenAt_idx" ON "ExploitFlag"("accountId", "lastSeenAt" DESC);

