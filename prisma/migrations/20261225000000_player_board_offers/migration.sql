-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN "playerBoardEscrow" JSONB NOT NULL DEFAULT '{}';

-- CreateEnum
CREATE TYPE "PlayerBoardOfferStatus" AS ENUM ('OPEN', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlayerBoardPriceKind" AS ENUM ('CASH', 'BARTER');

-- CreateTable
CREATE TABLE "PlayerBoardOffer" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "bookCents" INTEGER NOT NULL,
    "priceKind" "PlayerBoardPriceKind" NOT NULL DEFAULT 'CASH',
    "lotSize" INTEGER NOT NULL DEFAULT 1,
    "askItems" JSONB,
    "askBookCents" INTEGER,
    "feeCents" INTEGER NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "pausedMinutesAtPost" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PlayerBoardOfferStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "PlayerBoardOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerBoardOffer_roundId_status_itemKey_unitPriceCents_idx" ON "PlayerBoardOffer"("roundId", "status", "itemKey", "unitPriceCents");

-- CreateIndex
CREATE INDEX "PlayerBoardOffer_sellerId_status_idx" ON "PlayerBoardOffer"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "PlayerBoardOffer" ADD CONSTRAINT "PlayerBoardOffer_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerBoardOffer" ADD CONSTRAINT "PlayerBoardOffer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlayerBoardFill" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "quantity" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL,
    "proceedsCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerBoardFill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerBoardFill_offerId_idx" ON "PlayerBoardFill"("offerId");

-- CreateIndex
CREATE INDEX "PlayerBoardFill_buyerId_idx" ON "PlayerBoardFill"("buyerId");

-- AddForeignKey
ALTER TABLE "PlayerBoardFill" ADD CONSTRAINT "PlayerBoardFill_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PlayerBoardOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerBoardFill" ADD CONSTRAINT "PlayerBoardFill_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "RoundPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
