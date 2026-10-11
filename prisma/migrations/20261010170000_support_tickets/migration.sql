-- /support tickets: a private Discord thread between one member and staff.
-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL,
    "accountId" TEXT,
    "subject" TEXT NOT NULL,
    "threadId" TEXT,
    "staffMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedByName" TEXT,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_threadId_key" ON "SupportTicket"("threadId");

-- CreateIndex
CREATE INDEX "SupportTicket_discordId_closedAt_idx" ON "SupportTicket"("discordId", "closedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_accountId_createdAt_idx" ON "SupportTicket"("accountId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

