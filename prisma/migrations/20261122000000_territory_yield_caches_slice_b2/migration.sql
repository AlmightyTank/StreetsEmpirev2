-- Cache contents are durable; accrual remains derived from authoritative control intervals.
CREATE TABLE "TerritoryYieldCache" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL,
    "ownerAllianceId" TEXT,
    "contents" JSONB NOT NULL DEFAULT '{}',
    "fractionalRemainders" JSONB NOT NULL DEFAULT '{}',
    "lastSettledAt" TIMESTAMP(3) NOT NULL,
    "carryMillis" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TerritoryYieldCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerritoryYieldCache_roundId_scope_locationKey_key" ON "TerritoryYieldCache"("roundId", "scope", "locationKey");
CREATE INDEX "TerritoryYieldCache_roundId_ownerAllianceId_scope_idx" ON "TerritoryYieldCache"("roundId", "ownerAllianceId", "scope");
ALTER TABLE "TerritoryYieldCache" ADD CONSTRAINT "TerritoryYieldCache_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
