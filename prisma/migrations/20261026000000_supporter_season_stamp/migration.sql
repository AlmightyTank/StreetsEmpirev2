-- Season support stamp: permanent per-account per-season record written at round close.
CREATE TABLE "SupporterSeasonStamp" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupporterSeasonStamp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupporterSeasonStamp_accountId_roundId_key" ON "SupporterSeasonStamp"("accountId", "roundId");
CREATE INDEX "SupporterSeasonStamp_roundId_idx" ON "SupporterSeasonStamp"("roundId");

ALTER TABLE "SupporterSeasonStamp" ADD CONSTRAINT "SupporterSeasonStamp_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupporterSeasonStamp" ADD CONSTRAINT "SupporterSeasonStamp_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
