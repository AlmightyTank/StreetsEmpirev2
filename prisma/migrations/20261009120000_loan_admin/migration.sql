-- 1.6.5-F. Audited loan corrections: late fees waived (kept on record as assessed), and
-- missed installments excused (rescheduled, first due time and miss kept). An excused
-- installment can be missed again, so a late fee is unique per settle key, not per installment.
ALTER TYPE "LoanEventKind" ADD VALUE IF NOT EXISTS 'CORRECTED';

ALTER TABLE "Loan" ADD COLUMN "lateFeesWaivedCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "LoanInstallment" ADD COLUMN "excusedAt" TIMESTAMP(3), ADD COLUMN "originalDueAt" TIMESTAMP(3);
ALTER TABLE "LoanFee" ADD COLUMN "waivedCents" BIGINT NOT NULL DEFAULT 0, ADD COLUMN "waivedAt" TIMESTAMP(3);

DROP INDEX "LoanFee_installmentId_kind_key";
CREATE INDEX "LoanFee_installmentId_kind_idx" ON "LoanFee"("installmentId", "kind");

ALTER TABLE "Loan" DROP CONSTRAINT "Loan_terms_and_balance_valid";
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_terms_and_balance_valid" CHECK (
  "principalCents" > 0 AND "contractFeeCents" >= 0
  AND "obligationCents" = "principalCents" + "contractFeeCents"
  AND "principalPaidCents" >= 0 AND "principalPaidCents" <= "principalCents"
  AND "contractFeePaidCents" >= 0 AND "contractFeeWaivedCents" >= 0
  AND "contractFeePaidCents" + "contractFeeWaivedCents" <= "contractFeeCents"
  AND "lateFeeCents" >= 0 AND "lateFeeCapCents" >= 0
  AND "lateFeesAssessedCents" >= 0 AND "lateFeesAssessedCents" <= "lateFeeCapCents"
  AND "lateFeesPaidCents" >= 0 AND "lateFeesWaivedCents" >= 0
  AND "lateFeesPaidCents" + "lateFeesWaivedCents" <= "lateFeesAssessedCents"
  AND "installmentCount" > 0 AND "installmentIntervalHours" > 0
);

ALTER TABLE "LoanFee" ADD CONSTRAINT "LoanFee_waiver_valid" CHECK ("waivedCents" >= 0 AND "waivedCents" <= "amountCents");
