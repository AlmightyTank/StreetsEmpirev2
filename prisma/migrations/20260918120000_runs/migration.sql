-- 0.5.0-B. Runs: a wallet and a trunk out on the road, Pip's shelves in other cities,
-- and what a crew saw there.
-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('ACTIVE', 'RETURNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'RUN_LAUNCHED';
ALTER TYPE "ActivityType" ADD VALUE 'RUN_RETURNED';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "awayNetWorthCents" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'ACTIVE',
    "homeCity" TEXT NOT NULL,
    "lowRiders" INTEGER NOT NULL,
    "escortThugs" INTEGER NOT NULL,
    "cashCents" BIGINT NOT NULL,
    "startCashCents" BIGINT NOT NULL,
    "turnsSpent" INTEGER NOT NULL,
    "launchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunStop" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "route" JSONB NOT NULL,
    "departAt" TIMESTAMP(3) NOT NULL,
    "arriveAt" TIMESTAMP(3) NOT NULL,
    "leaveAt" TIMESTAMP(3),

    CONSTRAINT "RunStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunCargo" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startQuantity" INTEGER NOT NULL,

    CONSTRAINT "RunCargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunTrade" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityShelf" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "stockAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityShelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitySighting" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "counter" JSONB NOT NULL,

    CONSTRAINT "CitySighting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Run_roundPlayerId_status_idx" ON "Run"("roundPlayerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RunStop_runId_order_key" ON "RunStop"("runId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RunCargo_runId_productKey_key" ON "RunCargo"("runId", "productKey");

-- CreateIndex
CREATE INDEX "RunTrade_runId_idx" ON "RunTrade"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "CityShelf_roundPlayerId_city_productKey_key" ON "CityShelf"("roundPlayerId", "city", "productKey");

-- CreateIndex
CREATE UNIQUE INDEX "CitySighting_roundPlayerId_city_key" ON "CitySighting"("roundPlayerId", "city");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStop" ADD CONSTRAINT "RunStop_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunCargo" ADD CONSTRAINT "RunCargo_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunTrade" ADD CONSTRAINT "RunTrade_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityShelf" ADD CONSTRAINT "CityShelf_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitySighting" ADD CONSTRAINT "CitySighting_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nothing on the road goes negative, the same guard PlayerProduct has.
ALTER TABLE "Run" ADD CONSTRAINT "Run_amounts_nonnegative" CHECK ("cashCents" >= 0 AND "startCashCents" >= 0 AND "lowRiders" >= 1 AND "escortThugs" >= 0 AND "turnsSpent" >= 0);
ALTER TABLE "RunCargo" ADD CONSTRAINT "RunCargo_quantity_nonnegative" CHECK ("quantity" >= 0 AND "startQuantity" >= 0);
ALTER TABLE "CityShelf" ADD CONSTRAINT "CityShelf_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_away_nonnegative" CHECK ("awayNetWorthCents" >= 0);
