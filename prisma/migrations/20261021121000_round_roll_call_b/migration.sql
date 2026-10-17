-- Keep all existing rounds on v1 if newer catalogs are introduced later.
ALTER TABLE "Round" ADD COLUMN "roundLoginRewardVersion" TEXT NOT NULL DEFAULT 'round-roll-call-v1';

-- Slice B: immutable paid step receipts. One payout per round player + tier.
CREATE TABLE "RoundLoginRewardClaim" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "rewardVersion" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoundLoginRewardClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoundLoginRewardClaim_tier_positive" CHECK ("tier" >= 1)
);
CREATE UNIQUE INDEX "RoundLoginRewardClaim_roundPlayerId_tier_key" ON "RoundLoginRewardClaim"("roundPlayerId", "tier");
CREATE INDEX "RoundLoginRewardClaim_roundPlayerId_claimedAt_idx" ON "RoundLoginRewardClaim"("roundPlayerId", "claimedAt");
ALTER TABLE "RoundLoginRewardClaim" ADD CONSTRAINT "RoundLoginRewardClaim_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
