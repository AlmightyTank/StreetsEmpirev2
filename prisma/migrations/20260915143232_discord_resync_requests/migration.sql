-- CreateTable
CREATE TABLE "DiscordResyncRequest" (
    "id" TEXT NOT NULL,
    "discordId" TEXT,
    "requestedByAccountId" TEXT,
    "requestedByUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "DiscordResyncRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordResyncRequest_claimedAt_createdAt_idx" ON "DiscordResyncRequest"("claimedAt", "createdAt");
