ALTER TABLE "Round"
ADD COLUMN "discordEndedClaimedAt" TIMESTAMP(3),
ADD COLUMN "discordEndedMessageId" TEXT,
ADD COLUMN "discordEndedError" TEXT;

CREATE INDEX "Round_discordEndedAt_discordEndedClaimedAt_idx"
ON "Round"("discordEndedAt", "discordEndedClaimedAt");
