-- 2.0.0-E: one-time case result and reward audit, stored with the
-- existing uniquely identified case row. Null for all historical cases.
ALTER TABLE "CriminalCaseFile" ADD COLUMN "outcomeTitle" TEXT;
ALTER TABLE "CriminalCaseFile" ADD COLUMN "outcomeSummary" TEXT;
ALTER TABLE "CriminalCaseFile" ADD COLUMN "outcomeCategory" TEXT;
ALTER TABLE "CriminalCaseFile" ADD COLUMN "rewardCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CriminalCaseFile" ADD COLUMN "rewardClaimedAt" TIMESTAMP(3);
