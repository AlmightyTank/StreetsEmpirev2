ALTER TABLE "Account" ADD COLUMN "playGamesId" TEXT;
ALTER TABLE "Account" ADD COLUMN "playGamesDisplayName" TEXT;
ALTER TABLE "Account" ADD COLUMN "playGamesLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Account_playGamesId_key" ON "Account"("playGamesId");
