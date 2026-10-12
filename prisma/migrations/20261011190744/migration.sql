-- CreateTable
CREATE TABLE "RoundAftermathRewardClaim" (
    "id" TEXT NOT NULL,
    "targetRoundId" TEXT NOT NULL,
    "sourceRoundId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "qualificationKeys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundAftermathRewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoundAftermathRewardClaim_sourceRoundId_idx" ON "RoundAftermathRewardClaim"("sourceRoundId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundAftermathRewardClaim_targetRoundId_accountId_key" ON "RoundAftermathRewardClaim"("targetRoundId", "accountId");

-- AddForeignKey
ALTER TABLE "RoundAftermathRewardClaim" ADD CONSTRAINT "RoundAftermathRewardClaim_targetRoundId_fkey" FOREIGN KEY ("targetRoundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundAftermathRewardClaim" ADD CONSTRAINT "RoundAftermathRewardClaim_sourceRoundId_fkey" FOREIGN KEY ("sourceRoundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundAftermathRewardClaim" ADD CONSTRAINT "RoundAftermathRewardClaim_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
