-- Keep IDs of Discord's original announcement so edits update in place.
ALTER TABLE "GameNews"
  ADD COLUMN "discordMessageId" TEXT,
  ADD COLUMN "discordEditQueuedAt" TIMESTAMP(3),
  ADD COLUMN "discordEditClaimedAt" TIMESTAMP(3),
  ADD COLUMN "discordEditError" TEXT;

-- Track the last review-notice snapshot so the bot can edit it on change/publication.
ALTER TABLE "DiscordStaffPost"
  ADD COLUMN "syncedNewsAt" TIMESTAMP(3),
  ADD COLUMN "syncedState" TEXT;

CREATE INDEX "GameNews_discordEditQueuedAt_idx" ON "GameNews"("discordEditQueuedAt");
