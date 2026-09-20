-- 0.6.0-D: one supply/tax box per away-held turf block.
CREATE TABLE "TurfOutpost" (
    "id" TEXT NOT NULL,
    "turfId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "cashCents" BIGINT NOT NULL DEFAULT 0,
    "beer" INTEGER NOT NULL DEFAULT 0,
    "products" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TurfOutpost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TurfOutpost_turfId_key" ON "TurfOutpost"("turfId");
CREATE INDEX "TurfOutpost_ownerId_idx" ON "TurfOutpost"("ownerId");

ALTER TABLE "TurfOutpost"
  ADD CONSTRAINT "TurfOutpost_turfId_fkey"
  FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TurfOutpost"
  ADD CONSTRAINT "TurfOutpost_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
