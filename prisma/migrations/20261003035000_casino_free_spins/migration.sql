-- StreetsEmpire 1.2.0-B: durable free-spin bundles.
-- One active bundle per round player. The exact wager/lines are frozen until consumed.

CREATE TABLE "CasinoFreeSpinBonus" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "citySlug" TEXT NOT NULL,
  "machineKey" TEXT NOT NULL,
  "betPerLineCents" BIGINT NOT NULL,
  "activePaylineKeys" JSONB NOT NULL,
  "awardedSpins" INTEGER NOT NULL,
  "remainingSpins" INTEGER NOT NULL,
  "totalWonCents" BIGINT NOT NULL DEFAULT 0,
  "sourceActionId" TEXT NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoFreeSpinBonus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasinoFreeSpinBonus_roundPlayerId_key" ON "CasinoFreeSpinBonus"("roundPlayerId");
CREATE INDEX "CasinoFreeSpinBonus_machineKey_idx" ON "CasinoFreeSpinBonus"("machineKey");
CREATE INDEX "CasinoFreeSpinBonus_citySlug_idx" ON "CasinoFreeSpinBonus"("citySlug");

ALTER TABLE "CasinoFreeSpinBonus"
  ADD CONSTRAINT "CasinoFreeSpinBonus_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
