CREATE TABLE "GangPlayerRelationship" (
    "id" TEXT NOT NULL,
    "gangId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "score" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "firstEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendettaAt" TIMESTAMP(3),
    "nemesisAt" TIMESTAMP(3),
    "defeatedAt" TIMESTAMP(3),
    CONSTRAINT "GangPlayerRelationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GangEvent" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "gangId" TEXT NOT NULL,
    "roundPlayerId" TEXT,
    "turfId" TEXT,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "scoreDelta" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GangEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GangPlayerRelationship_gangId_roundPlayerId_key" ON "GangPlayerRelationship"("gangId", "roundPlayerId");
CREATE INDEX "GangPlayerRelationship_roundPlayerId_status_lastEventAt_idx" ON "GangPlayerRelationship"("roundPlayerId", "status", "lastEventAt");
CREATE UNIQUE INDEX "GangEvent_idempotencyKey_key" ON "GangEvent"("idempotencyKey");
CREATE INDEX "GangEvent_roundId_occurredAt_idx" ON "GangEvent"("roundId", "occurredAt" DESC);
CREATE INDEX "GangEvent_gangId_occurredAt_idx" ON "GangEvent"("gangId", "occurredAt" DESC);
CREATE INDEX "GangEvent_roundPlayerId_occurredAt_idx" ON "GangEvent"("roundPlayerId", "occurredAt" DESC);

ALTER TABLE "GangPlayerRelationship" ADD CONSTRAINT "GangPlayerRelationship_gangId_fkey" FOREIGN KEY ("gangId") REFERENCES "EncounterGang"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GangPlayerRelationship" ADD CONSTRAINT "GangPlayerRelationship_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GangEvent" ADD CONSTRAINT "GangEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GangEvent" ADD CONSTRAINT "GangEvent_gangId_fkey" FOREIGN KEY ("gangId") REFERENCES "EncounterGang"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GangEvent" ADD CONSTRAINT "GangEvent_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GangEvent" ADD CONSTRAINT "GangEvent_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE SET NULL ON UPDATE CASCADE;
