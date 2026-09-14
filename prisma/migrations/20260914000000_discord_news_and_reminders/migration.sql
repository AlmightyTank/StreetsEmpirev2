-- Discord news auto-post: existing news counts as already posted, so the bot's
-- first run doesn't flood the channel with the whole archive.
ALTER TABLE "GameNews" ADD COLUMN "discordPostedAt" TIMESTAMP(3);
UPDATE "GameNews" SET "discordPostedAt" = CURRENT_TIMESTAMP;

-- Opt-in Discord DM reminders.
CREATE TABLE "DiscordReminder" (
    "accountId" TEXT NOT NULL,
    "turnsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "turnsArmed" BOOLEAN NOT NULL DEFAULT false,
    "turnsLastSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordReminder_pkey" PRIMARY KEY ("accountId")
);
CREATE INDEX "DiscordReminder_turnsEnabled_idx" ON "DiscordReminder"("turnsEnabled");
ALTER TABLE "DiscordReminder" ADD CONSTRAINT "DiscordReminder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
