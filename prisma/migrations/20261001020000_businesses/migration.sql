-- 1.1.0-A: three business lots on every turf block. Rows are created lazily with
-- the round's turf rows; every lot starts empty (level 0).
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "turfId" TEXT NOT NULL,
    "lot" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Business_turfId_lot_key" ON "Business"("turfId", "lot");
CREATE INDEX "Business_roundId_idx" ON "Business"("roundId");

ALTER TABLE "Business"
  ADD CONSTRAINT "Business_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Business"
  ADD CONSTRAINT "Business_turfId_fkey"
  FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
