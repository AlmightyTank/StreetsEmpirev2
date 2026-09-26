-- 0.9.0-G: notification categories, quiet controls, bell mutes, clock-event alerts.

ALTER TYPE "ActivityType" ADD VALUE 'TURF_PUSH_INCOMING';
ALTER TYPE "ActivityType" ADD VALUE 'ALLIANCE_CALL';
ALTER TYPE "ActivityType" ADD VALUE 'REVENGE_EXPIRING';
ALTER TYPE "ActivityType" ADD VALUE 'SPECIAL_ORDER_READY';

-- AlterTable
ALTER TABLE "AllianceWirePost" ADD COLUMN     "alertsCollectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ConvoyTail" ADD COLUMN     "alliesAlertedAt" TIMESTAMP(3),
ADD COLUMN     "ownerAlertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "alertsCollectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "alertsPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "announcementsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bellMuted" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "convoyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messagesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ordersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quietEndMinute" INTEGER,
ADD COLUMN     "quietStartMinute" INTEGER,
ADD COLUMN     "reinforcementsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revengeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "runsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "turfPushEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RaidBattle" ADD COLUMN     "revengeAlertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "homeAlertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TurfPush" ADD COLUMN     "alliesAlertedAt" TIMESTAMP(3),
ADD COLUMN     "defenderAlertedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ScheduledAlert" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledAlert_firedAt_dueAt_idx" ON "ScheduledAlert"("firedAt", "dueAt");

-- CreateIndex
CREATE INDEX "ScheduledAlert_roundPlayerId_idx" ON "ScheduledAlert"("roundPlayerId");

-- CreateIndex
CREATE INDEX "AllianceWirePost_alertsCollectedAt_createdAt_idx" ON "AllianceWirePost"("alertsCollectedAt", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_alertsCollectedAt_createdAt_idx" ON "DirectMessage"("alertsCollectedAt", "createdAt");

-- CreateIndex
CREATE INDEX "RaidBattle_revengeAlertedAt_createdAt_idx" ON "RaidBattle"("revengeAlertedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Run_homeAlertedAt_returnedAt_idx" ON "Run"("homeAlertedAt", "returnedAt");

-- AddForeignKey
ALTER TABLE "ScheduledAlert" ADD CONSTRAINT "ScheduledAlert_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Everything that already happened was already visible in game. Mark it collected so the
-- first collection after deploy does not alert about history.
UPDATE "DirectMessage" SET "alertsCollectedAt" = CURRENT_TIMESTAMP WHERE "alertsCollectedAt" IS NULL;
UPDATE "AllianceWirePost" SET "alertsCollectedAt" = CURRENT_TIMESTAMP WHERE "alertsCollectedAt" IS NULL;
UPDATE "Run" SET "homeAlertedAt" = CURRENT_TIMESTAMP WHERE "homeAlertedAt" IS NULL AND "status" = 'RETURNED';
UPDATE "RaidBattle" SET "revengeAlertedAt" = CURRENT_TIMESTAMP WHERE "revengeAlertedAt" IS NULL;
