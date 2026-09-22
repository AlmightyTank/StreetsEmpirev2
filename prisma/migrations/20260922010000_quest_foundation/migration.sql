-- Quest system Phase A: version-pinned definitions and per-player attempts.

CREATE TYPE "QuestStatus" AS ENUM (
  'LOCKED',
  'AVAILABLE',
  'ACTIVE',
  'READY_TO_TURN_IN',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

CREATE TYPE "QuestRepeatability" AS ENUM (
  'ONCE',
  'DAILY',
  'WEEKLY',
  'REPEATABLE'
);

CREATE TABLE "QuestDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "rulesetId" TEXT NOT NULL,
  "rulesetVersion" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "contactKey" TEXT,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "difficulty" TEXT NOT NULL,
  "prerequisites" JSONB NOT NULL DEFAULT '[]',
  "objectives" JSONB NOT NULL,
  "bonusObjectives" JSONB NOT NULL DEFAULT '[]',
  "rewards" JSONB NOT NULL,
  "followUpKeys" JSONB NOT NULL DEFAULT '[]',
  "availability" JSONB NOT NULL DEFAULT '{}',
  "repeatability" "QuestRepeatability" NOT NULL DEFAULT 'ONCE',
  "expiresAfterMinutes" INTEGER,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "QuestDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerQuest" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "questDefinitionId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "status" "QuestStatus" NOT NULL DEFAULT 'AVAILABLE',
  "objectiveProgress" JSONB NOT NULL DEFAULT '{}',
  "bonusProgress" JSONB NOT NULL DEFAULT '{}',
  "chosenBranch" TEXT,
  "rewardState" JSONB NOT NULL DEFAULT '{}',
  "acceptedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlayerQuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestDefinition_rulesetId_rulesetVersion_key_key"
  ON "QuestDefinition"("rulesetId", "rulesetVersion", "key");

CREATE INDEX "QuestDefinition_rulesetId_rulesetVersion_isEnabled_idx"
  ON "QuestDefinition"("rulesetId", "rulesetVersion", "isEnabled");

CREATE INDEX "QuestDefinition_contactKey_isEnabled_idx"
  ON "QuestDefinition"("contactKey", "isEnabled");

CREATE UNIQUE INDEX "PlayerQuest_roundPlayerId_questDefinitionId_attempt_key"
  ON "PlayerQuest"("roundPlayerId", "questDefinitionId", "attempt");

CREATE INDEX "PlayerQuest_roundPlayerId_status_idx"
  ON "PlayerQuest"("roundPlayerId", "status");

CREATE INDEX "PlayerQuest_questDefinitionId_status_idx"
  ON "PlayerQuest"("questDefinitionId", "status");

CREATE INDEX "PlayerQuest_status_expiresAt_idx"
  ON "PlayerQuest"("status", "expiresAt");

ALTER TABLE "PlayerQuest"
  ADD CONSTRAINT "PlayerQuest_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerQuest"
  ADD CONSTRAINT "PlayerQuest_questDefinitionId_fkey"
  FOREIGN KEY ("questDefinitionId") REFERENCES "QuestDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
