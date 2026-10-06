-- StreetsEmpire 1.4.0-D: faction warnings get their own alert category, for the bell mute and
-- for push and Discord.

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN "factionsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlayerFactionWarning" ADD COLUMN "alertsCollectedAt" TIMESTAMP(3),
ADD COLUMN "href" TEXT NOT NULL DEFAULT '/game/quests#factions',
ADD COLUMN "text" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "PlayerFactionWarning_alertsCollectedAt_createdAt_idx" ON "PlayerFactionWarning"("alertsCollectedAt", "createdAt");
