-- CreateEnum
CREATE TYPE "PlayerBoardOfferStatus" AS ENUM ('OPEN', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PlayerBoardOffer" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "bookCents" INTEGER NOT NULL,
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
