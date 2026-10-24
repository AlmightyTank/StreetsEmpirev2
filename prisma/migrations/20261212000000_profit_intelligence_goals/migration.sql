CREATE TABLE "ProfitIntelligenceGoal" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "minimumLiquidityCents" BIGINT,
    "minimumProductKey" TEXT,
    "minimumProductUnits" INTEGER,
    "maximumRoutePurchaseCents" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfitIntelligenceGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfitIntelligenceGoal_roundPlayerId_key" ON "ProfitIntelligenceGoal"("roundPlayerId");

ALTER TABLE "ProfitIntelligenceGoal" ADD CONSTRAINT "ProfitIntelligenceGoal_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
