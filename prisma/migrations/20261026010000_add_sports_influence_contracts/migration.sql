CREATE TABLE "SportsInfluenceContract" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "playerQuestId" TEXT NOT NULL,
    "sportsbookEventId" TEXT NOT NULL,
    "targetTeam" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "desiredOutcome" TEXT NOT NULL,
    "approach" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 50,
    "influencePower" INTEGER NOT NULL DEFAULT 0,
    "exposure" TEXT NOT NULL DEFAULT 'MEDIUM',
    "evidenceGenerated" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "actualOutcome" TEXT,
    "success" BOOLEAN,
    "heatDelta" INTEGER NOT NULL DEFAULT 0,
    "resolutionReason" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsInfluenceContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SportsInfluenceContract_playerQuestId_key" ON "SportsInfluenceContract"("playerQuestId");
CREATE INDEX "SportsInfluenceContract_roundPlayerId_status_idx" ON "SportsInfluenceContract"("roundPlayerId", "status");
CREATE INDEX "SportsInfluenceContract_sportsbookEventId_status_idx" ON "SportsInfluenceContract"("sportsbookEventId", "status");
CREATE INDEX "SportsInfluenceContract_status_deadlineAt_idx" ON "SportsInfluenceContract"("status", "deadlineAt");

ALTER TABLE "SportsInfluenceContract" ADD CONSTRAINT "SportsInfluenceContract_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SportsInfluenceContract" ADD CONSTRAINT "SportsInfluenceContract_playerQuestId_fkey"
  FOREIGN KEY ("playerQuestId") REFERENCES "PlayerQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SportsInfluenceContract" ADD CONSTRAINT "SportsInfluenceContract_sportsbookEventId_fkey"
  FOREIGN KEY ("sportsbookEventId") REFERENCES "SportsbookEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
