-- 1.1.0-B: businesses can be built, staffed and collected. Staff stay in the owner's
-- thugs/whores and are marked as businessThugs/businessWhores: counted, never working.
ALTER TYPE "ActivityType" ADD VALUE 'BUSINESS_BUILD';
ALTER TYPE "ActivityType" ADD VALUE 'BUSINESS_STAFF';
ALTER TYPE "ActivityType" ADD VALUE 'BUSINESS_COLLECT';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "businessThugs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "businessWhores" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "accruedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "registerCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "staff" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "staffOwnerId" TEXT;

-- CreateIndex
CREATE INDEX "Business_staffOwnerId_idx" ON "Business"("staffOwnerId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_staffOwnerId_fkey" FOREIGN KEY ("staffOwnerId") REFERENCES "RoundPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

