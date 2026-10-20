CREATE TABLE "TerritoryTollPayment" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "holderAllianceId" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL,
    "chargedCents" BIGINT NOT NULL,
    "actionId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TerritoryTollPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerritoryTollPayment_roundPlayerId_actionId_key" ON "TerritoryTollPayment"("roundPlayerId", "actionId");
CREATE INDEX "TerritoryTollPayment_roundPlayerId_accessKey_usedAt_idx" ON "TerritoryTollPayment"("roundPlayerId", "accessKey", "usedAt");
CREATE INDEX "TerritoryTollPayment_holderAllianceId_usedAt_idx" ON "TerritoryTollPayment"("holderAllianceId", "usedAt");
ALTER TABLE "TerritoryTollPayment" ADD CONSTRAINT "TerritoryTollPayment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryTollPayment" ADD CONSTRAINT "TerritoryTollPayment_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TerritoryYieldDailyLedger" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "dayStart" TIMESTAMP(3) NOT NULL,
    "valueCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TerritoryYieldDailyLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerritoryYieldDailyLedger_roundId_allianceId_dayStart_key" ON "TerritoryYieldDailyLedger"("roundId", "allianceId", "dayStart");
CREATE INDEX "TerritoryYieldDailyLedger_roundId_allianceId_dayStart_idx" ON "TerritoryYieldDailyLedger"("roundId", "allianceId", "dayStart");
ALTER TABLE "TerritoryYieldDailyLedger" ADD CONSTRAINT "TerritoryYieldDailyLedger_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TerritoryYieldPlayerDailyLedger" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "dayStart" TIMESTAMP(3) NOT NULL,
    "valueCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TerritoryYieldPlayerDailyLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerritoryYieldPlayerDailyLedger_roundPlayerId_dayStart_key" ON "TerritoryYieldPlayerDailyLedger"("roundPlayerId", "dayStart");
CREATE INDEX "TerritoryYieldPlayerDailyLedger_roundId_dayStart_idx" ON "TerritoryYieldPlayerDailyLedger"("roundId", "dayStart");
ALTER TABLE "TerritoryYieldPlayerDailyLedger" ADD CONSTRAINT "TerritoryYieldPlayerDailyLedger_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryYieldPlayerDailyLedger" ADD CONSTRAINT "TerritoryYieldPlayerDailyLedger_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
