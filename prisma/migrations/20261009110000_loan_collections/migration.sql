-- 1.6.5-E. Collection pressure and recovery: a recovering standing, the on-time streak that
-- ends it, when collections began, a once-only garnish marker on income lines, and an
-- activity type for going into (and out of) collections.
ALTER TYPE "LoanCollectionState" ADD VALUE IF NOT EXISTS 'RECOVERING';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LOAN_COLLECTIONS';

ALTER TABLE "RoundPlayer"
  ADD COLUMN "loanRecoveryNeeded" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loanCollectionsSince" TIMESTAMP(3);

ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_loan_recovery_nonnegative" CHECK ("loanRecoveryNeeded" >= 0);

ALTER TABLE "EconomyLedgerEntry" ADD COLUMN "loanCollectedAt" TIMESTAMP(3);
