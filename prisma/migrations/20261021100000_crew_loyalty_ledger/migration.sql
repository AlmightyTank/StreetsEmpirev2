-- 2.1.0-B: round-only crew loyalty with immutable deduplicated source receipts.
ALTER TABLE "CrewMember" ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CrewLoyaltyEntry" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrewLoyaltyEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrewLoyaltyEntry_points_check" CHECK ("points" >= 0 AND "points" <= 4)
);
CREATE UNIQUE INDEX "CrewLoyaltyEntry_memberId_sourceKey_key" ON "CrewLoyaltyEntry"("memberId", "sourceKey");
CREATE INDEX "CrewLoyaltyEntry_memberId_at_idx" ON "CrewLoyaltyEntry"("memberId", "at" DESC);
CREATE INDEX "CrewLoyaltyEntry_roundPlayerId_at_idx" ON "CrewLoyaltyEntry"("roundPlayerId", "at" DESC);
ALTER TABLE "CrewLoyaltyEntry" ADD CONSTRAINT "CrewLoyaltyEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CrewMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewLoyaltyEntry" ADD CONSTRAINT "CrewLoyaltyEntry_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_loyaltyPoints_check" CHECK ("loyaltyPoints" >= 0 AND "loyaltyPoints" <= 100);
