ALTER TABLE "Account"
ADD COLUMN "territoryTestAccount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TerritoryTollPayment"
ADD COLUMN "consumedAt" TIMESTAMP(3),
ADD COLUMN "consumedByActionId" TEXT;

CREATE TABLE "TerritoryRoundAward" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "awardKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TerritoryRoundAward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerritoryRoundAward_roundPlayerId_awardKey_scopeKey_key"
ON "TerritoryRoundAward"("roundPlayerId", "awardKey", "scopeKey");
CREATE INDEX "TerritoryRoundAward_roundId_awardKey_scopeKey_idx"
ON "TerritoryRoundAward"("roundId", "awardKey", "scopeKey");
CREATE INDEX "TerritoryRoundAward_allianceId_awardedAt_idx"
ON "TerritoryRoundAward"("allianceId", "awardedAt");

ALTER TABLE "TerritoryRoundAward"
ADD CONSTRAINT "TerritoryRoundAward_roundId_fkey"
FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryRoundAward"
ADD CONSTRAINT "TerritoryRoundAward_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryRoundAward"
ADD CONSTRAINT "TerritoryRoundAward_allianceId_fkey"
FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
