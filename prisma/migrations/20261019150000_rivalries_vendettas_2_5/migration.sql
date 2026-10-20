CREATE TYPE "RivalryStatus" AS ENUM ('ACTIVE', 'MUTUAL', 'ONE_SIDED', 'SUPPRESSED', 'CEASEFIRE', 'TIMEOUT', 'DEFEATED', 'CLOSED');
CREATE TYPE "RivalryMutuality" AS ENUM ('UNKNOWN', 'MUTUAL', 'ONE_SIDED', 'SUPPRESSED');
CREATE TYPE "RivalryVisibility" AS ENUM ('PARTICIPANT', 'INVOLVED_ONLY', 'PUBLIC', 'SUPPRESSED');

CREATE TABLE "RivalryRelationship" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "participantAId" TEXT NOT NULL,
  "participantBId" TEXT NOT NULL,
  "rulesetId" TEXT NOT NULL,
  "rulesetVersion" TEXT NOT NULL,
  "status" "RivalryStatus" NOT NULL DEFAULT 'ACTIVE',
  "mutuality" "RivalryMutuality" NOT NULL DEFAULT 'UNKNOWN',
  "scoreA" INTEGER NOT NULL DEFAULT 0,
  "scoreB" INTEGER NOT NULL DEFAULT 0,
  "lastSettledAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "suppressedAt" TIMESTAMP(3),
  "suppressionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RivalryRelationship_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RivalrySourceReceipt" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "scoreDelta" INTEGER NOT NULL DEFAULT 0,
  "settledAt" TIMESTAMP(3) NOT NULL,
  "visibility" "RivalryVisibility" NOT NULL DEFAULT 'INVOLVED_ONLY',
  "decisionReason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalrySourceReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RivalryStateTransition" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "fromStatus" "RivalryStatus",
  "toStatus" "RivalryStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalryStateTransition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RivalryFeudContract" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "proposerId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "objective" JSONB NOT NULL,
  "terms" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalryFeudContract_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RivalrySettlement" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "contractId" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "receipt" JSONB NOT NULL DEFAULT '{}',
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalrySettlement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RivalryPublicStoryDecision" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "sourceId" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "suppressed" BOOLEAN NOT NULL DEFAULT false,
  "headline" TEXT,
  "reason" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalryPublicStoryDecision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RivalrySuppressionReport" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "reporterId" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "operatorId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalrySuppressionReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RivalryAwardClaim" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "awardKey" TEXT NOT NULL,
  "sourceMilestone" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalryAwardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RivalryRelationship_roundId_participantAId_participantBId_key" ON "RivalryRelationship"("roundId", "participantAId", "participantBId");
CREATE INDEX "RivalryRelationship_roundId_status_updatedAt_idx" ON "RivalryRelationship"("roundId", "status", "updatedAt");
CREATE INDEX "RivalryRelationship_participantAId_roundId_updatedAt_idx" ON "RivalryRelationship"("participantAId", "roundId", "updatedAt");
CREATE INDEX "RivalryRelationship_participantBId_roundId_updatedAt_idx" ON "RivalryRelationship"("participantBId", "roundId", "updatedAt");
CREATE UNIQUE INDEX "RivalrySourceReceipt_relationshipId_sourceKind_sourceId_key" ON "RivalrySourceReceipt"("relationshipId", "sourceKind", "sourceId");
CREATE INDEX "RivalrySourceReceipt_relationshipId_settledAt_idx" ON "RivalrySourceReceipt"("relationshipId", "settledAt");
CREATE INDEX "RivalrySourceReceipt_sourceKind_sourceId_idx" ON "RivalrySourceReceipt"("sourceKind", "sourceId");
CREATE INDEX "RivalryStateTransition_relationshipId_createdAt_idx" ON "RivalryStateTransition"("relationshipId", "createdAt");
CREATE UNIQUE INDEX "RivalryFeudContract_idempotencyKey_key" ON "RivalryFeudContract"("idempotencyKey");
CREATE INDEX "RivalryFeudContract_relationshipId_status_expiresAt_idx" ON "RivalryFeudContract"("relationshipId", "status", "expiresAt");
CREATE INDEX "RivalryFeudContract_targetId_createdAt_idx" ON "RivalryFeudContract"("targetId", "createdAt");
CREATE UNIQUE INDEX "RivalrySettlement_relationshipId_contractId_status_key" ON "RivalrySettlement"("relationshipId", "contractId", "status");
CREATE INDEX "RivalrySettlement_relationshipId_settledAt_idx" ON "RivalrySettlement"("relationshipId", "settledAt");
CREATE INDEX "RivalryPublicStoryDecision_relationshipId_published_decidedAt_idx" ON "RivalryPublicStoryDecision"("relationshipId", "published", "decidedAt");
CREATE INDEX "RivalrySuppressionReport_relationshipId_status_createdAt_idx" ON "RivalrySuppressionReport"("relationshipId", "status", "createdAt");
CREATE UNIQUE INDEX "RivalryAwardClaim_relationshipId_roundPlayerId_awardKey_key" ON "RivalryAwardClaim"("relationshipId", "roundPlayerId", "awardKey");
CREATE INDEX "RivalryAwardClaim_roundPlayerId_claimedAt_idx" ON "RivalryAwardClaim"("roundPlayerId", "claimedAt");

ALTER TABLE "RivalryRelationship" ADD CONSTRAINT "RivalryRelationship_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryRelationship" ADD CONSTRAINT "RivalryRelationship_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryRelationship" ADD CONSTRAINT "RivalryRelationship_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalrySourceReceipt" ADD CONSTRAINT "RivalrySourceReceipt_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "RivalryRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalrySourceReceipt" ADD CONSTRAINT "RivalrySourceReceipt_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryStateTransition" ADD CONSTRAINT "RivalryStateTransition_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "RivalryRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryFeudContract" ADD CONSTRAINT "RivalryFeudContract_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "RivalryRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryFeudContract" ADD CONSTRAINT "RivalryFeudContract_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryFeudContract" ADD CONSTRAINT "RivalryFeudContract_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalrySettlement" ADD CONSTRAINT "RivalrySettlement_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "RivalryRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryPublicStoryDecision" ADD CONSTRAINT "RivalryPublicStoryDecision_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "RivalryRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalrySuppressionReport" ADD CONSTRAINT "RivalrySuppressionReport_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "RivalryRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryAwardClaim" ADD CONSTRAINT "RivalryAwardClaim_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "RivalryRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RivalryAwardClaim" ADD CONSTRAINT "RivalryAwardClaim_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
