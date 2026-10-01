-- Street Pass step 2. Each player's Street Cred for the round's pass, and one row per claimed tier.
-- The unique (player, pass, tier) key is what stops a tier paying out twice.
-- CreateTable
CREATE TABLE "StreetPassProgress" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "passKey" TEXT NOT NULL,
    "cred" INTEGER NOT NULL DEFAULT 0,
    "lateJoinBonusPercent" INTEGER NOT NULL DEFAULT 0,
    "turnCredWindowStartsAt" TIMESTAMP(3),
    "turnCredInWindow" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreetPassProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreetPassClaim" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "passKey" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreetPassClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreetPassProgress_roundPlayerId_key" ON "StreetPassProgress"("roundPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "StreetPassClaim_roundPlayerId_passKey_tier_key" ON "StreetPassClaim"("roundPlayerId", "passKey", "tier");

-- AddForeignKey
ALTER TABLE "StreetPassProgress" ADD CONSTRAINT "StreetPassProgress_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreetPassClaim" ADD CONSTRAINT "StreetPassClaim_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Claims show in the activity feed.
ALTER TYPE "ActivityType" ADD VALUE 'STREET_PASS_CLAIMED';
