-- 1.6.0-C. Pickups load at the supplier and land in a warehouse.

-- AlterTable
ALTER TABLE "SupplyPickup" ADD COLUMN     "deliveredQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loadedAt" TIMESTAMP(3),
ADD COLUMN     "warehouseId" TEXT;

-- CreateIndex
CREATE INDEX "SupplyPickup_warehouseId_status_idx" ON "SupplyPickup"("warehouseId", "status");

-- AddForeignKey
ALTER TABLE "SupplyPickup" ADD CONSTRAINT "SupplyPickup_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "SupplyWarehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Delivered units never exceed the load, and only a finished pickup has any.
ALTER TABLE "SupplyPickup" ADD CONSTRAINT "SupplyPickup_delivered_within_load" CHECK (
    "deliveredQuantity" >= 0
    AND "deliveredQuantity" <= "quantity"
    AND ("deliveredQuantity" = 0 OR "status" = 'DELIVERED')
);
