-- 0.9.0-B1: durable private messages, account-level blocks, and message reports.

CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "senderArchivedAt" TIMESTAMP(3),
    "recipientArchivedAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerBlock" (
    "id" TEXT NOT NULL,
    "blockerAccountId" TEXT NOT NULL,
    "blockedAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerMessageReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reporterAccountId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUsername" TEXT,
    "resolution" TEXT,

    CONSTRAINT "PlayerMessageReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectMessage_senderId_actionId_key"
  ON "DirectMessage"("senderId", "actionId");
CREATE INDEX "DirectMessage_recipient_inbox_idx"
  ON "DirectMessage"("recipientId", "recipientArchivedAt", "readAt", "createdAt" DESC);
CREATE INDEX "DirectMessage_sender_sent_idx"
  ON "DirectMessage"("senderId", "senderArchivedAt", "createdAt" DESC);
CREATE INDEX "DirectMessage_round_created_idx"
  ON "DirectMessage"("roundId", "createdAt" DESC);

CREATE UNIQUE INDEX "PlayerBlock_blockerAccountId_blockedAccountId_key"
  ON "PlayerBlock"("blockerAccountId", "blockedAccountId");
CREATE INDEX "PlayerBlock_blocked_created_idx"
  ON "PlayerBlock"("blockedAccountId", "createdAt" DESC);

CREATE UNIQUE INDEX "PlayerMessageReport_messageId_reporterAccountId_key"
  ON "PlayerMessageReport"("messageId", "reporterAccountId");
CREATE INDEX "PlayerMessageReport_resolution_idx"
  ON "PlayerMessageReport"("resolvedAt", "createdAt" DESC);
CREATE INDEX "PlayerMessageReport_reporter_idx"
  ON "PlayerMessageReport"("reporterAccountId", "createdAt" DESC);

ALTER TABLE "DirectMessage"
  ADD CONSTRAINT "DirectMessage_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage"
  ADD CONSTRAINT "DirectMessage_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage"
  ADD CONSTRAINT "DirectMessage_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerBlock"
  ADD CONSTRAINT "PlayerBlock_blockerAccountId_fkey"
  FOREIGN KEY ("blockerAccountId") REFERENCES "Account"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerBlock"
  ADD CONSTRAINT "PlayerBlock_blockedAccountId_fkey"
  FOREIGN KEY ("blockedAccountId") REFERENCES "Account"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerMessageReport"
  ADD CONSTRAINT "PlayerMessageReport_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerMessageReport"
  ADD CONSTRAINT "PlayerMessageReport_reporterAccountId_fkey"
  FOREIGN KEY ("reporterAccountId") REFERENCES "Account"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
