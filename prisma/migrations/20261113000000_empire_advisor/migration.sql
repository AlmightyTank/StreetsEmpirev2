ALTER TABLE "AccountProfile" ADD COLUMN "advisorPreferences" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "AdvisorSuppression" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "suggestionKey" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "until" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvisorSuppression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdvisorSuppression_accountId_roundId_suggestionKey_key" ON "AdvisorSuppression"("accountId", "roundId", "suggestionKey");
CREATE INDEX "AdvisorSuppression_roundId_accountId_idx" ON "AdvisorSuppression"("roundId", "accountId");
ALTER TABLE "AdvisorSuppression" ADD CONSTRAINT "AdvisorSuppression_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorSuppression" ADD CONSTRAINT "AdvisorSuppression_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
