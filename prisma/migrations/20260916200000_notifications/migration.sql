-- Discord reminders become channel-neutral notification settings. Existing opt-ins keep Discord on.
ALTER TABLE "DiscordReminder" RENAME TO "NotificationSettings";
ALTER TABLE "NotificationSettings" RENAME CONSTRAINT "DiscordReminder_pkey" TO "NotificationSettings_pkey";
ALTER TABLE "NotificationSettings" RENAME CONSTRAINT "DiscordReminder_accountId_fkey" TO "NotificationSettings_accountId_fkey";
ALTER INDEX "DiscordReminder_turnsEnabled_idx" RENAME TO "NotificationSettings_turnsEnabled_idx";
ALTER TABLE "NotificationSettings"
  ADD COLUMN "discordEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Attack alerts are collected apart from the raid feed. Battles the feed already has were alerted.
ALTER TABLE "RaidBattle" ADD COLUMN "alertsCollectedAt" TIMESTAMP(3);
UPDATE "RaidBattle" SET "alertsCollectedAt" = "discordPostedAt";

-- Round alerts move off the Discord markers; only the public round-end post keeps one.
ALTER TABLE "Round" RENAME COLUMN "discordOpenedAt" TO "alertsOpenedAt";
ALTER TABLE "Round" RENAME COLUMN "discordEndingSoonAt" TO "alertsEndingSoonAt";
ALTER TABLE "Round" ADD COLUMN "alertsEndedAt" TIMESTAMP(3);
UPDATE "Round" SET "alertsEndedAt" = "discordEndedAt";

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('DISCORD', 'PUSH');

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_channel_claimedAt_createdAt_idx" ON "NotificationOutbox"("channel", "claimedAt", "createdAt");
CREATE INDEX "NotificationOutbox_createdAt_idx" ON "NotificationOutbox"("createdAt");
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_accountId_idx" ON "PushSubscription"("accountId");

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
