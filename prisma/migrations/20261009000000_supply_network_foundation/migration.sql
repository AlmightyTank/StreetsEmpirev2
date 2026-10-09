-- CreateEnum
CREATE TYPE "SupplyOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_COLLECTED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplyPickupStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DealerCrewStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupplyMovementKind" AS ENUM ('ORDERED', 'PICKED_UP', 'STORED', 'ASSIGNED_TO_DEALER', 'SOLD', 'RETURNED');

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "dealerThugs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SupplyOrder" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "supplierCitySlug" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantityOrdered" INTEGER NOT NULL,
    "quantityCollected" INTEGER NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER NOT NULL,
    "totalPaidCents" BIGINT NOT NULL,
    "status" "SupplyOrderStatus" NOT NULL DEFAULT 'OPEN',
    "requestKey" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyPickup" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "runId" TEXT,
    "routeKey" TEXT NOT NULL,
    "originCitySlug" TEXT NOT NULL,
    "destinationCitySlug" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "vehicleLoadout" JSONB NOT NULL DEFAULT '{}',
    "status" "SupplyPickupStatus" NOT NULL DEFAULT 'PLANNED',
    "requestKey" VARCHAR(128) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "expectedArrivalAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyPickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyWarehouse" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacityUnits" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyStock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerCrew" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "districtKey" TEXT NOT NULL,
    "status" "DealerCrewStatus" NOT NULL DEFAULT 'ACTIVE',
    "capacityUnits" INTEGER NOT NULL,
    "operatingCostCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerCrew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerStaff" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "dealerCrewId" TEXT,
    "experiencePoints" INTEGER NOT NULL DEFAULT 0,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerStock" (
    "id" TEXT NOT NULL,
    "dealerCrewId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerSale" (
    "id" TEXT NOT NULL,
    "dealerCrewId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "batchKey" VARCHAR(128) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "crewCutCents" BIGINT NOT NULL DEFAULT 0,
    "netCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyMovement" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "kind" "SupplyMovementKind" NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "orderId" TEXT,
    "pickupId" TEXT,
    "warehouseId" TEXT,
    "dealerCrewId" TEXT,
    "requestKey" VARCHAR(128) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplyOrder_roundPlayerId_status_createdAt_idx" ON "SupplyOrder"("roundPlayerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupplyOrder_roundPlayerId_supplierCitySlug_createdAt_idx" ON "SupplyOrder"("roundPlayerId", "supplierCitySlug", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrder_roundPlayerId_requestKey_key" ON "SupplyOrder"("roundPlayerId", "requestKey");

-- CreateIndex
CREATE INDEX "SupplyPickup_orderId_status_idx" ON "SupplyPickup"("orderId", "status");

-- CreateIndex
CREATE INDEX "SupplyPickup_runId_idx" ON "SupplyPickup"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyPickup_orderId_requestKey_key" ON "SupplyPickup"("orderId", "requestKey");

-- CreateIndex
CREATE INDEX "SupplyWarehouse_roundPlayerId_citySlug_isActive_idx" ON "SupplyWarehouse"("roundPlayerId", "citySlug", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyWarehouse_roundPlayerId_citySlug_name_key" ON "SupplyWarehouse"("roundPlayerId", "citySlug", "name");

-- CreateIndex
CREATE INDEX "SupplyStock_productKey_idx" ON "SupplyStock"("productKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyStock_warehouseId_productKey_key" ON "SupplyStock"("warehouseId", "productKey");

-- CreateIndex
CREATE INDEX "DealerCrew_roundPlayerId_citySlug_status_idx" ON "DealerCrew"("roundPlayerId", "citySlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DealerCrew_roundPlayerId_citySlug_districtKey_key" ON "DealerCrew"("roundPlayerId", "citySlug", "districtKey");

-- CreateIndex
CREATE INDEX "DealerStaff_roundPlayerId_dealerCrewId_releasedAt_idx" ON "DealerStaff"("roundPlayerId", "dealerCrewId", "releasedAt");

-- CreateIndex
CREATE INDEX "DealerStaff_roundPlayerId_experiencePoints_idx" ON "DealerStaff"("roundPlayerId", "experiencePoints");

-- CreateIndex
CREATE INDEX "DealerStock_productKey_idx" ON "DealerStock"("productKey");

-- CreateIndex
CREATE UNIQUE INDEX "DealerStock_dealerCrewId_productKey_key" ON "DealerStock"("dealerCrewId", "productKey");

-- CreateIndex
CREATE INDEX "DealerSale_dealerCrewId_createdAt_idx" ON "DealerSale"("dealerCrewId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DealerSale_dealerCrewId_batchKey_key" ON "DealerSale"("dealerCrewId", "batchKey");

-- CreateIndex
CREATE INDEX "SupplyMovement_roundPlayerId_createdAt_idx" ON "SupplyMovement"("roundPlayerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupplyMovement_orderId_createdAt_idx" ON "SupplyMovement"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplyMovement_pickupId_createdAt_idx" ON "SupplyMovement"("pickupId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplyMovement_warehouseId_createdAt_idx" ON "SupplyMovement"("warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplyMovement_dealerCrewId_createdAt_idx" ON "SupplyMovement"("dealerCrewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyMovement_roundPlayerId_requestKey_key" ON "SupplyMovement"("roundPlayerId", "requestKey");

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyPickup" ADD CONSTRAINT "SupplyPickup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyPickup" ADD CONSTRAINT "SupplyPickup_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyWarehouse" ADD CONSTRAINT "SupplyWarehouse_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyStock" ADD CONSTRAINT "SupplyStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "SupplyWarehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerCrew" ADD CONSTRAINT "DealerCrew_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerStaff" ADD CONSTRAINT "DealerStaff_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerStaff" ADD CONSTRAINT "DealerStaff_dealerCrewId_fkey" FOREIGN KEY ("dealerCrewId") REFERENCES "DealerCrew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerStock" ADD CONSTRAINT "DealerStock_dealerCrewId_fkey" FOREIGN KEY ("dealerCrewId") REFERENCES "DealerCrew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerSale" ADD CONSTRAINT "DealerSale_dealerCrewId_fkey" FOREIGN KEY ("dealerCrewId") REFERENCES "DealerCrew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplyOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_pickupId_fkey" FOREIGN KEY ("pickupId") REFERENCES "SupplyPickup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "SupplyWarehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_dealerCrewId_fkey" FOREIGN KEY ("dealerCrewId") REFERENCES "DealerCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add checks that Prisma's schema language cannot express.
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_dealerThugs_nonnegative" CHECK ("dealerThugs" >= 0);

ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_quantity_and_payment_valid" CHECK (
    "quantityOrdered" > 0
    AND "quantityCollected" >= 0
    AND "quantityCollected" <= "quantityOrdered"
    AND "unitCostCents" >= 0
    AND "totalPaidCents" = ("unitCostCents"::BIGINT * "quantityOrdered"::BIGINT)
    AND (
      ("status" = 'OPEN' AND "quantityCollected" = 0)
      OR ("status" = 'PARTIALLY_COLLECTED' AND "quantityCollected" > 0 AND "quantityCollected" < "quantityOrdered")
      OR ("status" = 'FULFILLED' AND "quantityCollected" = "quantityOrdered")
      OR ("status" = 'CANCELLED' AND "quantityCollected" < "quantityOrdered")
    )
);

ALTER TABLE "SupplyPickup" ADD CONSTRAINT "SupplyPickup_quantity_and_loadout_valid" CHECK (
    "quantity" > 0 AND jsonb_typeof("vehicleLoadout") = 'object'
);

ALTER TABLE "SupplyWarehouse" ADD CONSTRAINT "SupplyWarehouse_capacity_positive" CHECK ("capacityUnits" > 0);
ALTER TABLE "SupplyStock" ADD CONSTRAINT "SupplyStock_quantity_nonnegative" CHECK ("quantity" >= 0);

ALTER TABLE "DealerCrew" ADD CONSTRAINT "DealerCrew_capacity_and_operating_cost_valid" CHECK (
    "capacityUnits" > 0 AND "operatingCostCents" >= 0
);
ALTER TABLE "DealerStaff" ADD CONSTRAINT "DealerStaff_career_valid" CHECK (
    "experiencePoints" >= 0
    AND (("dealerCrewId" IS NULL) = ("releasedAt" IS NOT NULL))
    AND ("releasedAt" IS NULL OR "releasedAt" >= "assignedAt")
);
ALTER TABLE "DealerStock" ADD CONSTRAINT "DealerStock_quantity_nonnegative" CHECK ("quantity" >= 0);

ALTER TABLE "DealerSale" ADD CONSTRAINT "DealerSale_receipt_valid" CHECK (
    "quantity" > 0
    AND "unitPriceCents" >= 0
    AND "grossCents" = ("quantity"::BIGINT * "unitPriceCents"::BIGINT)
    AND "crewCutCents" >= 0
    AND "crewCutCents" <= "grossCents"
    AND "netCents" = ("grossCents" - "crewCutCents")
);

ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_quantity_delta_nonzero" CHECK ("quantityDelta" <> 0);
