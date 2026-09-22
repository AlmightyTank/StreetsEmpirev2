-- Quest system Phase B: durable per-quest event receipts for idempotent progress.

CREATE TABLE "QuestProgressReceipt" (
  "id" TEXT NOT NULL,
  "playerQuestId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "applied" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuestProgressReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestProgressReceipt_playerQuestId_sourceKey_key"
  ON "QuestProgressReceipt"("playerQuestId", "sourceKey");

CREATE INDEX "QuestProgressReceipt_playerQuestId_createdAt_idx"
  ON "QuestProgressReceipt"("playerQuestId", "createdAt");

CREATE INDEX "QuestProgressReceipt_sourceKey_idx"
  ON "QuestProgressReceipt"("sourceKey");

ALTER TABLE "QuestProgressReceipt"
  ADD CONSTRAINT "QuestProgressReceipt_playerQuestId_fkey"
  FOREIGN KEY ("playerQuestId") REFERENCES "PlayerQuest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
