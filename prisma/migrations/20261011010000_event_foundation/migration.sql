-- 1.8.5-A. First-class event identities, occurrences, participation and receipts.
-- Additive foundation only: no legacy event rows are rewritten in this slice.
CREATE TYPE "GameEventType" AS ENUM ('COMMUNITY', 'SEASONAL', 'RANDOM_ENCOUNTER', 'CITY_CONDITION');
CREATE TYPE "GameEventScope" AS ENUM ('ROUND', 'PLAYER', 'CITY');
CREATE TYPE "GameEventOccurrenceStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "GameEventParticipationStatus" AS ENUM ('OFFERED', 'ACTIVE', 'COMPLETED', 'CLAIMED', 'EXPIRED', 'WITHDRAWN');

CREATE TABLE "GameEventDefinition" (
  "id" TEXT NOT NULL,
  "rulesetId" TEXT NOT NULL,
  "rulesetVersion" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "type" "GameEventType" NOT NULL,
  "scope" "GameEventScope" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "schedule" JSONB NOT NULL,
  "objectives" JSONB NOT NULL DEFAULT '[]',
  "rewards" JSONB NOT NULL DEFAULT '[]',
  "config" JSONB NOT NULL DEFAULT '{}',
  "sourceKind" TEXT,
  "sourceKey" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameEventDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameEventDefinition_rulesetId_rulesetVersion_key_key"
  ON "GameEventDefinition"("rulesetId", "rulesetVersion", "key");
CREATE INDEX "GameEventDefinition_ruleset_type_idx"
  ON "GameEventDefinition"("rulesetId", "rulesetVersion", "type", "isEnabled");
CREATE INDEX "GameEventDefinition_sourceKind_sourceKey_idx"
  ON "GameEventDefinition"("sourceKind", "sourceKey");

CREATE TABLE "GameEventOccurrence" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "roundId" TEXT,
  "occurrenceKey" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL DEFAULT '',
  "status" "GameEventOccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "schedule" JSONB NOT NULL DEFAULT '{}',
  "config" JSONB NOT NULL DEFAULT '{}',
  "activatedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameEventOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameEventOccurrence_definitionId_occurrenceKey_key"
  ON "GameEventOccurrence"("definitionId", "occurrenceKey");
CREATE INDEX "GameEventOccurrence_roundId_status_startsAt_idx"
  ON "GameEventOccurrence"("roundId", "status", "startsAt");
CREATE INDEX "GameEventOccurrence_status_startsAt_endsAt_idx"
  ON "GameEventOccurrence"("status", "startsAt", "endsAt");
CREATE INDEX "GameEventOccurrence_scopeKey_status_idx"
  ON "GameEventOccurrence"("scopeKey", "status");

CREATE TABLE "GameEventParticipation" (
  "id" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "status" "GameEventParticipationStatus" NOT NULL DEFAULT 'OFFERED',
  "progress" JSONB NOT NULL DEFAULT '{}',
  "state" JSONB NOT NULL DEFAULT '{}',
  "acceptedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameEventParticipation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameEventParticipation_occurrenceId_roundPlayerId_key"
  ON "GameEventParticipation"("occurrenceId", "roundPlayerId");
CREATE INDEX "GameEventParticipation_roundPlayerId_status_updatedAt_idx"
  ON "GameEventParticipation"("roundPlayerId", "status", "updatedAt" DESC);
CREATE INDEX "GameEventParticipation_occurrenceId_status_idx"
  ON "GameEventParticipation"("occurrenceId", "status");

CREATE TABLE "GameEventProgressReceipt" (
  "id" TEXT NOT NULL,
  "participationId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "objectiveKey" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameEventProgressReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameEventProgressReceipt_participationId_sourceKey_key"
  ON "GameEventProgressReceipt"("participationId", "sourceKey");
CREATE INDEX "GameEventProgressReceipt_lookup_idx"
  ON "GameEventProgressReceipt"("participationId", "objectiveKey", "recordedAt");

CREATE TABLE "GameEventRewardClaim" (
  "id" TEXT NOT NULL,
  "participationId" TEXT NOT NULL,
  "rewardKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reward" JSONB NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameEventRewardClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameEventRewardClaim_idempotencyKey_key"
  ON "GameEventRewardClaim"("idempotencyKey");
CREATE UNIQUE INDEX "GameEventRewardClaim_participationId_rewardKey_key"
  ON "GameEventRewardClaim"("participationId", "rewardKey");
CREATE INDEX "GameEventRewardClaim_claimedAt_idx"
  ON "GameEventRewardClaim"("claimedAt" DESC);

CREATE TABLE "GameEventHistory" (
  "id" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "participationId" TEXT,
  "action" TEXT NOT NULL,
  "actorLabel" TEXT,
  "dedupeKey" TEXT,
  "before" JSONB,
  "after" JSONB,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameEventHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameEventHistory_dedupeKey_key" ON "GameEventHistory"("dedupeKey");
CREATE INDEX "GameEventHistory_occurrenceId_happenedAt_idx"
  ON "GameEventHistory"("occurrenceId", "happenedAt" DESC);
CREATE INDEX "GameEventHistory_participationId_happenedAt_idx"
  ON "GameEventHistory"("participationId", "happenedAt" DESC);

ALTER TABLE "GameEventOccurrence"
  ADD CONSTRAINT "GameEventOccurrence_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "GameEventDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameEventOccurrence"
  ADD CONSTRAINT "GameEventOccurrence_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameEventParticipation"
  ADD CONSTRAINT "GameEventParticipation_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "GameEventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameEventParticipation"
  ADD CONSTRAINT "GameEventParticipation_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameEventProgressReceipt"
  ADD CONSTRAINT "GameEventProgressReceipt_participationId_fkey"
  FOREIGN KEY ("participationId") REFERENCES "GameEventParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameEventRewardClaim"
  ADD CONSTRAINT "GameEventRewardClaim_participationId_fkey"
  FOREIGN KEY ("participationId") REFERENCES "GameEventParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameEventHistory"
  ADD CONSTRAINT "GameEventHistory_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "GameEventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameEventHistory"
  ADD CONSTRAINT "GameEventHistory_participationId_fkey"
  FOREIGN KEY ("participationId") REFERENCES "GameEventParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
