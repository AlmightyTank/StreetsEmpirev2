-- 0.6.0-E: durable alliance city-control changes for Discord/public history.
CREATE TABLE "TurfControlEvent" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "previousAllianceId" TEXT,
    "previousAllianceName" TEXT,
    "previousAllianceTag" TEXT,
    "nextAllianceId" TEXT,
    "nextAllianceName" TEXT,
    "nextAllianceTag" TEXT,
    "previousBlocksHeld" INTEGER NOT NULL DEFAULT 0,
    "nextBlocksHeld" INTEGER NOT NULL DEFAULT 0,
    "blocksTotal" INTEGER NOT NULL,
    "happenedAt" TIMESTAMP(3) NOT NULL,
    "discordPostedAt" TIMESTAMP(3),

    CONSTRAINT "TurfControlEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TurfControlEvent_roundId_happenedAt_idx" ON "TurfControlEvent"("roundId", "happenedAt" DESC);
CREATE INDEX "TurfControlEvent_discordPostedAt_happenedAt_idx" ON "TurfControlEvent"("discordPostedAt", "happenedAt");

ALTER TABLE "TurfControlEvent"
  ADD CONSTRAINT "TurfControlEvent_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TurfControlEvent"
  ADD CONSTRAINT "TurfControlEvent_cityId_fkey"
  FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
