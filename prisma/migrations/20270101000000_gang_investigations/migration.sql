CREATE TABLE "GangInvestigation" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "gangId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "targetLocation" TEXT NOT NULL DEFAULT 'TURF_CORNER',
    "status" TEXT NOT NULL DEFAULT 'RUMOR',
    "confidence" INTEGER NOT NULL DEFAULT 1,
    "clueCount" INTEGER NOT NULL DEFAULT 0,
    "clues" JSONB NOT NULL DEFAULT '[]',
    "gangAwareness" INTEGER NOT NULL DEFAULT 0,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GangInvestigation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GangInvestigation_roundPlayerId_gangId_cityId_district_key" ON "GangInvestigation"("roundPlayerId", "gangId", "cityId", "district");
CREATE INDEX "GangInvestigation_roundPlayerId_status_expiresAt_idx" ON "GangInvestigation"("roundPlayerId", "status", "expiresAt");
CREATE INDEX "GangInvestigation_gangId_cityId_district_status_idx" ON "GangInvestigation"("gangId", "cityId", "district", "status");

ALTER TABLE "GangInvestigation" ADD CONSTRAINT "GangInvestigation_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GangInvestigation" ADD CONSTRAINT "GangInvestigation_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GangInvestigation" ADD CONSTRAINT "GangInvestigation_gangId_fkey" FOREIGN KEY ("gangId") REFERENCES "EncounterGang"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GangInvestigation" ADD CONSTRAINT "GangInvestigation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
