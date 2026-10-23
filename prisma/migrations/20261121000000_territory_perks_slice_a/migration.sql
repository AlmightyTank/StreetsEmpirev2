-- Territory perks stay disabled on every existing and newly-created round by default.
ALTER TABLE "Round" ADD COLUMN "territoryPerksEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Round" ADD COLUMN "territoryPerksCatalogVersion" TEXT;

CREATE TABLE "TerritoryPowerSelection" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "regionKey" TEXT NOT NULL,
    "perkKey" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TerritoryPowerSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TerritoryAuditEvent" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "allianceId" TEXT,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "sourceKey" TEXT,
    "details" JSONB NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TerritoryAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerritoryPowerSelection_allianceId_key" ON "TerritoryPowerSelection"("allianceId");
CREATE INDEX "TerritoryPowerSelection_roundId_regionKey_idx" ON "TerritoryPowerSelection"("roundId", "regionKey");
CREATE UNIQUE INDEX "TerritoryAuditEvent_idempotencyKey_key" ON "TerritoryAuditEvent"("idempotencyKey");
CREATE INDEX "TerritoryAuditEvent_roundId_happenedAt_idx" ON "TerritoryAuditEvent"("roundId", "happenedAt" DESC);
CREATE INDEX "TerritoryAuditEvent_roundId_allianceId_eventType_idx" ON "TerritoryAuditEvent"("roundId", "allianceId", "eventType");

ALTER TABLE "TerritoryPowerSelection" ADD CONSTRAINT "TerritoryPowerSelection_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryPowerSelection" ADD CONSTRAINT "TerritoryPowerSelection_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryAuditEvent" ADD CONSTRAINT "TerritoryAuditEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
