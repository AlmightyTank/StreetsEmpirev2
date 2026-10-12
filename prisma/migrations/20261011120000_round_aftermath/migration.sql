CREATE TYPE "RoundAftermathStatus" AS ENUM ('PREPARING', 'READY', 'UNAVAILABLE');

CREATE TABLE "RoundAftermathReport" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "RoundAftermathStatus" NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "cutoffAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "sourceProvenance" JSONB NOT NULL,
    "globalAggregate" JSONB,
    "cityAggregates" JSONB,
    "playerAggregates" JSONB,
    "categoryRecords" JSONB,
    "allianceAggregate" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundAftermathReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoundAftermathReport_roundId_key" ON "RoundAftermathReport"("roundId");
CREATE INDEX "RoundAftermathReport_status_finalizedAt_idx" ON "RoundAftermathReport"("status", "finalizedAt");

ALTER TABLE "RoundAftermathReport"
ADD CONSTRAINT "RoundAftermathReport_roundId_fkey"
FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing ended rounds have no guaranteed historical cutoff for all supported
-- sources. Keep the archive explicit rather than recalculating or inventing data.
INSERT INTO "RoundAftermathReport" (
    "id", "roundId", "status", "sourceRevision", "sourceProvenance"
)
SELECT
    'legacy-aftermath-' || "id",
    "id",
    'UNAVAILABLE',
    'legacy-pre-aftermath',
    '{"reason":"No canonical cutoff snapshot exists for this round; historical metrics were not reconstructed.","metrics":"NOT_RECORDED"}'::jsonb
FROM "Round"
WHERE "status" IN ('ENDED', 'ARCHIVED');
