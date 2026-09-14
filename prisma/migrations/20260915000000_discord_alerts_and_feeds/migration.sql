-- Discord alerts: attack, round and rank opt-ins next to the turn reminder.
ALTER TABLE "DiscordReminder"
  ADD COLUMN "attacksEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "roundEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rankEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rankRoundId" TEXT,
  ADD COLUMN "rankLastNational" INTEGER;

-- Raid feed and attack alerts: battles fought before the feed existed count as posted.
ALTER TABLE "RaidBattle" ADD COLUMN "discordPostedAt" TIMESTAMP(3);
UPDATE "RaidBattle" SET "discordPostedAt" = CURRENT_TIMESTAMP;

-- Round alerts and the round-end post: only changes from now on are announced.
ALTER TABLE "Round"
  ADD COLUMN "discordOpenedAt" TIMESTAMP(3),
  ADD COLUMN "discordEndingSoonAt" TIMESTAMP(3),
  ADD COLUMN "discordEndedAt" TIMESTAMP(3);
UPDATE "Round" SET "discordOpenedAt" = CURRENT_TIMESTAMP WHERE "status" <> 'SCHEDULED';
UPDATE "Round" SET "discordEndedAt" = CURRENT_TIMESTAMP
  WHERE "status" IN ('ENDED', 'ARCHIVED') OR ("status" <> 'SCHEDULED' AND "endsAt" <= CURRENT_TIMESTAMP);
UPDATE "Round" SET "discordEndingSoonAt" = CURRENT_TIMESTAMP
  WHERE "discordEndedAt" IS NOT NULL OR "endsAt" <= CURRENT_TIMESTAMP + INTERVAL '24 hours';
