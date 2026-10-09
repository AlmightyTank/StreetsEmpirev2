-- 1.6.0-F. Crews sell on a settled clock; stock moves between warehouses by shipment.

-- AlterTable
ALTER TABLE "DealerCrew" ADD COLUMN     "salesCarry" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "salesSettledAt" TIMESTAMP(3);

-- A pickup carries its own owner and product, so a shipment can have no order.
ALTER TABLE "SupplyPickup" ADD COLUMN     "productKey" TEXT,
ADD COLUMN     "roundPlayerId" TEXT,
ADD COLUMN     "sourceWarehouseId" TEXT;
UPDATE "SupplyPickup" AS p SET "productKey" = o."productKey", "roundPlayerId" = o."roundPlayerId"
FROM "SupplyOrder" AS o WHERE o."id" = p."orderId";
ALTER TABLE "SupplyPickup" ALTER COLUMN "productKey" SET NOT NULL,
ALTER COLUMN "roundPlayerId" SET NOT NULL,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SupplyPickup_sourceWarehouseId_requestKey_key" ON "SupplyPickup"("sourceWarehouseId", "requestKey");

-- CreateIndex
CREATE INDEX "SupplyPickup_roundPlayerId_createdAt_idx" ON "SupplyPickup"("roundPlayerId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupplyPickup" ADD CONSTRAINT "SupplyPickup_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyPickup" ADD CONSTRAINT "SupplyPickup_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "SupplyWarehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
