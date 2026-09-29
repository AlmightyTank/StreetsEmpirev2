-- 0.9.0-H: communication mutes, moderation notes, player mutes, per-side conversation
-- delete, and automated spam flags in the report queue.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "commsMuteReason" TEXT,
ADD COLUMN     "commsMutedByUsername" TEXT,
ADD COLUMN     "commsMutedPermanent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "commsMutedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "recipientHiddenAt" TIMESTAMP(3),
ADD COLUMN     "senderHiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlayerMessageReport" ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PLAYER',
ALTER COLUMN "reporterAccountId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AccountModerationNote" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "authorAccountId" TEXT,
    "authorUsername" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountModerationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMute" (
    "id" TEXT NOT NULL,
    "muterAccountId" TEXT NOT NULL,
    "mutedAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountModerationNote_accountId_createdAt_idx" ON "AccountModerationNote"("accountId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMute_muterAccountId_mutedAccountId_key" ON "PlayerMute"("muterAccountId", "mutedAccountId");

-- AddForeignKey
ALTER TABLE "AccountModerationNote" ADD CONSTRAINT "AccountModerationNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMute" ADD CONSTRAINT "PlayerMute_muterAccountId_fkey" FOREIGN KEY ("muterAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMute" ADD CONSTRAINT "PlayerMute_mutedAccountId_fkey" FOREIGN KEY ("mutedAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

