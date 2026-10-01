-- Trips A. The boss leaves home for a stay in another city and comes back.
-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'TRIP_STARTED';
ALTER TYPE "ActivityType" ADD VALUE 'TRIP_RETURNED';

-- CreateEnum
CREATE TYPE "BossTripMode" AS ENUM ('FLY', 'DRIVE');

-- CreateEnum
CREATE TYPE "BossTripStatus" AS ENUM ('ACTIVE', 'RETURNED');

-- CreateTable
CREATE TABLE "BossTrip" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "status" "BossTripStatus" NOT NULL DEFAULT 'ACTIVE',
    "mode" "BossTripMode" NOT NULL DEFAULT 'FLY',
    "homeCity" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "bankrollCents" BIGINT NOT NULL,
    "startBankrollCents" BIGINT NOT NULL,
    "ticketCents" BIGINT NOT NULL,
    "hotelCents" BIGINT NOT NULL,
    "turnsSpent" INTEGER NOT NULL,
    "departedAt" TIMESTAMP(3) NOT NULL,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "stayUntil" TIMESTAMP(3) NOT NULL,
    "returnsAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "BossTrip_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BossTrip_bankroll_nonnegative" CHECK ("bankrollCents" >= 0 AND "startBankrollCents" >= 0),
    CONSTRAINT "BossTrip_costs_nonnegative" CHECK ("ticketCents" >= 0 AND "hotelCents" >= 0 AND "turnsSpent" >= 0),
    CONSTRAINT "BossTrip_timeline_ordered" CHECK ("departedAt" <= "arrivesAt" AND "arrivesAt" <= "stayUntil" AND "stayUntil" <= "returnsAt")
);

-- CreateIndex
CREATE INDEX "BossTrip_roundPlayerId_status_idx" ON "BossTrip"("roundPlayerId", "status");

-- CreateIndex
CREATE INDEX "BossTrip_city_status_arrivesAt_idx" ON "BossTrip"("city", "status", "arrivesAt");

-- One boss, one trip at a time.
CREATE UNIQUE INDEX "BossTrip_one_active_per_player" ON "BossTrip"("roundPlayerId") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "BossTrip" ADD CONSTRAINT "BossTrip_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
