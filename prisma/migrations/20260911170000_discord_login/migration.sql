-- Add private account-level Discord login support.
ALTER TABLE "Account"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "discordId" TEXT,
  ADD COLUMN "discordUsername" TEXT,
  ADD COLUMN "discordAvatar" TEXT,
  ADD COLUMN "discordLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Account_discordId_key" ON "Account"("discordId");
