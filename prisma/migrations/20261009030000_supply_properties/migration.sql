-- 1.6.0-D. Warehouses are bought; safehouses are footholds. Both carry upkeep.

-- CreateEnum
CREATE TYPE "SupplyWarehouseKind" AS ENUM ('STASH', 'WAREHOUSE');

-- AlterTable
ALTER TABLE "SupplyWarehouse" ADD COLUMN     "kind" "SupplyWarehouseKind" NOT NULL DEFAULT 'WAREHOUSE',
ADD COLUMN     "paidThrough" TIMESTAMP(3),
ADD COLUMN     "purchasedCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "upkeepCents" BIGINT NOT NULL DEFAULT 0;

-- The 1.6.0-C home stash is the free one.
UPDATE "SupplyWarehouse" SET "kind" = 'STASH' WHERE "name" = 'Home stash';

-- CreateTable
CREATE TABLE "SupplySafehouse" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "upkeepCents" BIGINT NOT NULL,
    "paidThrough" TIMESTAMP(3) NOT NULL,
    "purchasedCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplySafehouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplySafehouse_roundPlayerId_isActive_idx" ON "SupplySafehouse"("roundPlayerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SupplySafehouse_roundPlayerId_citySlug_key" ON "SupplySafehouse"("roundPlayerId", "citySlug");

-- AddForeignKey
ALTER TABLE "SupplySafehouse" ADD CONSTRAINT "SupplySafehouse_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplySafehouse" ADD CONSTRAINT "SupplySafehouse_costs_nonnegative" CHECK ("upkeepCents" >= 0 AND "purchasedCents" >= 0);
ALTER TABLE "SupplyWarehouse" ADD CONSTRAINT "SupplyWarehouse_costs_nonnegative" CHECK ("upkeepCents" >= 0 AND "purchasedCents" >= 0);
