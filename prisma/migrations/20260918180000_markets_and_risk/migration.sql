-- 0.5.0-C. The shared high market (only the push is stored; the baseline is the round's
-- seeded schedule), what went wrong on a run, which leg of a run has been rolled for a
-- police stop, where a run traded, and time locked up after an arrest.
-- CreateEnum
CREATE TYPE "RunIncidentKind" AS ENUM ('STOP', 'BUST', 'ARREST');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'RUN_INCIDENT';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "roadChecks" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RunTrade" ADD COLUMN     "venue" TEXT NOT NULL DEFAULT 'pip';

-- CreateTable
CREATE TABLE "RunIncident" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "RunIncidentKind" NOT NULL,
    "city" TEXT NOT NULL,
    "road" TEXT,
    "seized" JSONB NOT NULL,
    "fineCents" BIGINT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HighMarket" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "push" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pushAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HighMarket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunIncident_runId_idx" ON "RunIncident"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "HighMarket_roundId_city_productKey_key" ON "HighMarket"("roundId", "city", "productKey");

-- AddForeignKey
ALTER TABLE "RunIncident" ADD CONSTRAINT "RunIncident_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighMarket" ADD CONSTRAINT "HighMarket_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Amounts never go below zero, and a trade is at Pip's or on the market.
ALTER TABLE "RunIncident" ADD CONSTRAINT "RunIncident_fineCents_check" CHECK ("fineCents" >= 0);
ALTER TABLE "Run" ADD CONSTRAINT "Run_roadChecks_check" CHECK ("roadChecks" >= 0);
ALTER TABLE "RunTrade" ADD CONSTRAINT "RunTrade_venue_check" CHECK ("venue" IN ('pip', 'market'));
