CREATE TABLE "CareerStoryInstance" (
  "id" TEXT NOT NULL, "roundPlayerId" TEXT NOT NULL, "roundId" TEXT NOT NULL,
  "career" TEXT NOT NULL, "catalogVersion" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "currentChapterKey" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerStoryInstance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CareerStorySourceClaim" (
  "id" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "sourceKind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL, "objectiveKey" TEXT NOT NULL, "settledAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareerStorySourceClaim_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CareerStoryChoice" (
  "id" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "chapterKey" TEXT NOT NULL,
  "branchKey" TEXT NOT NULL, "chosenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareerStoryChoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CareerStoryRelationship" (
  "id" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "subjectKey" TEXT NOT NULL,
  "relationshipKey" TEXT NOT NULL, "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerStoryRelationship_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CareerStoryPortfolio" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "instanceId" TEXT NOT NULL,
  "career" TEXT NOT NULL, "title" TEXT NOT NULL, "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "completedChapters" INTEGER NOT NULL DEFAULT 0, "finaleEarned" BOOLEAN NOT NULL DEFAULT false,
  "provenance" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerStoryPortfolio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerStoryInstance_player_career_version_key" ON "CareerStoryInstance"("roundPlayerId", "career", "catalogVersion");
CREATE INDEX "CareerStoryInstance_round_career_status_idx" ON "CareerStoryInstance"("roundId", "career", "status");
CREATE UNIQUE INDEX "CareerStorySourceClaim_idempotency_key" ON "CareerStorySourceClaim"("instanceId", "sourceKind", "sourceId", "objectiveKey");
CREATE INDEX "CareerStorySourceClaim_instance_objective_idx" ON "CareerStorySourceClaim"("instanceId", "objectiveKey");
CREATE UNIQUE INDEX "CareerStoryChoice_instance_chapter_key" ON "CareerStoryChoice"("instanceId", "chapterKey");
CREATE UNIQUE INDEX "CareerStoryRelationship_instance_subject_key" ON "CareerStoryRelationship"("instanceId", "subjectKey", "relationshipKey");
CREATE UNIQUE INDEX "CareerStoryPortfolio_instance_key" ON "CareerStoryPortfolio"("instanceId");
CREATE INDEX "CareerStoryPortfolio_account_visibility_idx" ON "CareerStoryPortfolio"("accountId", "visibility");
ALTER TABLE "CareerStoryInstance" ADD CONSTRAINT "CareerStoryInstance_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerStoryInstance" ADD CONSTRAINT "CareerStoryInstance_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerStorySourceClaim" ADD CONSTRAINT "CareerStorySourceClaim_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "CareerStoryInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerStoryChoice" ADD CONSTRAINT "CareerStoryChoice_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "CareerStoryInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerStoryRelationship" ADD CONSTRAINT "CareerStoryRelationship_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "CareerStoryInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerStoryPortfolio" ADD CONSTRAINT "CareerStoryPortfolio_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerStoryPortfolio" ADD CONSTRAINT "CareerStoryPortfolio_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "CareerStoryInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
