-- StreetsEmpire 1.2.0-E: rated play, casino status, comps and VIP rooms.

ALTER TYPE "ActivityType" ADD VALUE 'CASINO_STATUS_UP';
ALTER TYPE "ActivityType" ADD VALUE 'CASINO_COMP_HOTEL';

CREATE TABLE "CasinoRating" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "wageredCents" BIGINT NOT NULL DEFAULT 0,
  "theoBasis" BIGINT NOT NULL DEFAULT 0,
  "compBasis" BIGINT NOT NULL DEFAULT 0,
  "compsSpentCents" BIGINT NOT NULL DEFAULT 0,
  "ratedWagers" INTEGER NOT NULL DEFAULT 0,
  "lastRatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasinoRating_roundPlayerId_cityId_key" ON "CasinoRating"("roundPlayerId", "cityId");
CREATE INDEX "CasinoRating_cityId_idx" ON "CasinoRating"("cityId");

ALTER TABLE "CasinoRating" ADD CONSTRAINT "CasinoRating_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoRating" ADD CONSTRAINT "CasinoRating_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
