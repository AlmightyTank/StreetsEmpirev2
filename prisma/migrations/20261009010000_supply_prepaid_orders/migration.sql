-- CreateTable
CREATE TABLE "SupplySupplierStock" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantityAvailable" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplySupplierStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplySupplierStock_roundId_supplierKey_idx" ON "SupplySupplierStock"("roundId", "supplierKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplySupplierStock_roundId_supplierKey_productKey_key" ON "SupplySupplierStock"("roundId", "supplierKey", "productKey");

-- AddForeignKey
ALTER TABLE "SupplySupplierStock" ADD CONSTRAINT "SupplySupplierStock_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplySupplierStock" ADD CONSTRAINT "SupplySupplierStock_quantity_nonnegative" CHECK ("quantityAvailable" >= 0);
