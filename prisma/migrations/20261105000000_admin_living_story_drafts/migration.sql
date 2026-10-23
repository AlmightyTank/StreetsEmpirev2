-- Living Streets authoring proposals. Not read by player invitation/evidence/reward engines.
CREATE TABLE "AdminLivingStoryDraft" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "baseRulesetId" TEXT NOT NULL,
  "baseRulesetVersion" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "caseKey" TEXT NOT NULL,
  "eventKinds" JSONB NOT NULL DEFAULT '[]',
  "audience" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "expiresAfterActiveMinutes" INTEGER NOT NULL,
  "rewardBudgetCents" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByAccountId" TEXT NOT NULL,
  "updatedByAccountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminLivingStoryDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminLivingStoryDraft_baseRulesetId_key_key" ON "AdminLivingStoryDraft" ("baseRulesetId", "key");
CREATE INDEX "AdminLivingStoryDraft_baseRulesetId_updatedAt_idx" ON "AdminLivingStoryDraft" ("baseRulesetId", "updatedAt" DESC);
