-- 0.6.0-E: durable block-time history for the Territory board.
CREATE TABLE "TurfHoldSegment" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "turfId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "holderPublicPimpId" INTEGER NOT NULL,
    "holderName" TEXT NOT NULL,
    "allianceId" TEXT,
    "allianceName" TEXT,
    "allianceTag" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TurfHoldSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TurfHoldSegment_roundId_holderId_startedAt_idx"
  ON "TurfHoldSegment"("roundId", "holderId", "startedAt");
CREATE INDEX "TurfHoldSegment_roundId_allianceId_startedAt_idx"
  ON "TurfHoldSegment"("roundId", "allianceId", "startedAt");
CREATE INDEX "TurfHoldSegment_turfId_endedAt_idx"
  ON "TurfHoldSegment"("turfId", "endedAt");

-- At most one live ownership segment may exist for a block. This also makes
-- accidental concurrent writers fail closed instead of double-counting time.
CREATE UNIQUE INDEX "TurfHoldSegment_one_open_per_turf"
  ON "TurfHoldSegment"("turfId")
  WHERE "endedAt" IS NULL;

ALTER TABLE "TurfHoldSegment"
  ADD CONSTRAINT "TurfHoldSegment_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfHoldSegment"
  ADD CONSTRAINT "TurfHoldSegment_turfId_fkey"
  FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfHoldSegment"
  ADD CONSTRAINT "TurfHoldSegment_holderId_fkey"
  FOREIGN KEY ("holderId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed blocks already held when this migration lands. Later ownership and
-- membership changes are written by the application as they happen.
INSERT INTO "TurfHoldSegment" (
  "id", "roundId", "turfId", "holderId", "holderPublicPimpId", "holderName",
  "allianceId", "allianceName", "allianceTag", "startedAt", "endedAt", "createdAt"
)
SELECT
  'e-backfill-' || md5(t."id"),
  t."roundId",
  t."id",
  p."id",
  p."publicPimpId",
  p."displayName",
  p."allianceId",
  a."name",
  a."tag",
  COALESCE(t."heldSince", CURRENT_TIMESTAMP),
  NULL,
  CURRENT_TIMESTAMP
FROM "Turf" t
JOIN "RoundPlayer" p ON p."id" = t."holderId"
LEFT JOIN "Alliance" a ON a."id" = p."allianceId"
WHERE t."holderId" IS NOT NULL;
