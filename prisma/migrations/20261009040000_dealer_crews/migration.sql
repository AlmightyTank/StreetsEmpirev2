-- 1.6.0-E. A dealer crew sells one product at a price the player sets, and holds what
-- its dealers can carry: nothing until someone is posted.

-- AlterTable
ALTER TABLE "DealerCrew" ADD COLUMN     "priceCents" INTEGER,
ADD COLUMN     "productKey" TEXT;

ALTER TABLE "DealerCrew" DROP CONSTRAINT "DealerCrew_capacity_and_operating_cost_valid";
ALTER TABLE "DealerCrew" ADD CONSTRAINT "DealerCrew_capacity_and_operating_cost_valid" CHECK (
    "capacityUnits" >= 0 AND "operatingCostCents" >= 0
);
ALTER TABLE "DealerCrew" ADD CONSTRAINT "DealerCrew_price_positive" CHECK ("priceCents" IS NULL OR "priceCents" > 0);
