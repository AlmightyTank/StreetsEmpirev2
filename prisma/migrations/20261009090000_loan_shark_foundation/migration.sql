-- 1.6.5-A. Loan shark debt foundation: contracts, installments, payments, fees, the loan
-- journal, and the player's debt against one round-wide ceiling and a separate fee cap.

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'DELINQUENT', 'PAID_OFF');

-- CreateEnum
CREATE TYPE "LoanInstallmentStatus" AS ENUM ('SCHEDULED', 'PAID', 'MISSED');

-- CreateEnum
CREATE TYPE "LoanPaymentKind" AS ENUM ('SCHEDULED', 'MANUAL', 'COLLECTION');

-- CreateEnum
CREATE TYPE "LoanFeeKind" AS ENUM ('LATE', 'COLLECTION');

-- CreateEnum
CREATE TYPE "LoanCollectionState" AS ENUM ('CLEAR', 'DELINQUENT', 'COLLECTIONS');

-- CreateEnum
CREATE TYPE "LoanEventKind" AS ENUM ('ACCEPTED', 'PAYMENT', 'INSTALLMENT_MISSED', 'FEE_ASSESSED', 'PAID_OFF', 'COLLECTION_CHANGED');

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "loanCollectionState" "LoanCollectionState" NOT NULL DEFAULT 'CLEAR',
ADD COLUMN     "loanDebtCeilingCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "loanDebtCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "loanFeeCapCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "loanFeesAssessedCents" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "offerKey" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "principalCents" BIGINT NOT NULL,
    "contractFeeCents" BIGINT NOT NULL,
    "obligationCents" BIGINT NOT NULL,
    "principalPaidCents" BIGINT NOT NULL DEFAULT 0,
    "contractFeePaidCents" BIGINT NOT NULL DEFAULT 0,
    "lateFeeCents" BIGINT NOT NULL,
    "lateFeeCapCents" BIGINT NOT NULL,
    "lateFeesAssessedCents" BIGINT NOT NULL DEFAULT 0,
    "lateFeesPaidCents" BIGINT NOT NULL DEFAULT 0,
    "installmentCount" INTEGER NOT NULL,
    "installmentIntervalHours" INTEGER NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "requestKey" VARCHAR(128) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "paidOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "principalCents" BIGINT NOT NULL,
    "contractFeeCents" BIGINT NOT NULL,
    "principalPaidCents" BIGINT NOT NULL DEFAULT 0,
    "contractFeePaidCents" BIGINT NOT NULL DEFAULT 0,
    "status" "LoanInstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "missedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "kind" "LoanPaymentKind" NOT NULL,
    "requestKey" VARCHAR(128) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "lateFeeCents" BIGINT NOT NULL,
    "contractFeeCents" BIGINT NOT NULL,
    "principalCents" BIGINT NOT NULL,
    "debtAfterCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanFee" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "installmentId" TEXT,
    "kind" "LoanFeeKind" NOT NULL,
    "requestKey" VARCHAR(128) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "quotedCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanEvent" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "loanId" TEXT,
    "kind" "LoanEventKind" NOT NULL,
    "debtDeltaCents" BIGINT NOT NULL DEFAULT 0,
    "debtAfterCents" BIGINT NOT NULL,
    "requestKey" VARCHAR(128) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Loan_roundPlayerId_status_acceptedAt_idx" ON "Loan"("roundPlayerId", "status", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_roundPlayerId_requestKey_key" ON "Loan"("roundPlayerId", "requestKey");

-- CreateIndex
CREATE INDEX "LoanInstallment_roundPlayerId_status_dueAt_idx" ON "LoanInstallment"("roundPlayerId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_loanId_sequence_key" ON "LoanInstallment"("loanId", "sequence");

-- CreateIndex
CREATE INDEX "LoanPayment_loanId_createdAt_idx" ON "LoanPayment"("loanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanPayment_roundPlayerId_requestKey_key" ON "LoanPayment"("roundPlayerId", "requestKey");

-- CreateIndex
CREATE INDEX "LoanFee_loanId_createdAt_idx" ON "LoanFee"("loanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanFee_roundPlayerId_requestKey_key" ON "LoanFee"("roundPlayerId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "LoanFee_installmentId_kind_key" ON "LoanFee"("installmentId", "kind");

-- CreateIndex
CREATE INDEX "LoanEvent_roundPlayerId_createdAt_idx" ON "LoanEvent"("roundPlayerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoanEvent_loanId_createdAt_idx" ON "LoanEvent"("loanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanEvent_roundPlayerId_requestKey_key" ON "LoanEvent"("roundPlayerId", "requestKey");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanFee" ADD CONSTRAINT "LoanFee_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanFee" ADD CONSTRAINT "LoanFee_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanFee" ADD CONSTRAINT "LoanFee_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "LoanInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEvent" ADD CONSTRAINT "LoanEvent_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEvent" ADD CONSTRAINT "LoanEvent_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The hard limits, in the database as well as the code. A player's debt and late fees never
-- go below zero or above the limits fixed for the round when they first borrowed.
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_loan_debt_within_limits" CHECK (
  "loanDebtCents" >= 0 AND "loanDebtCents" <= "loanDebtCeilingCents"
  AND "loanFeesAssessedCents" >= 0 AND "loanFeesAssessedCents" <= "loanFeeCapCents"
);

ALTER TABLE "Loan" ADD CONSTRAINT "Loan_terms_and_balance_valid" CHECK (
  "principalCents" > 0 AND "contractFeeCents" >= 0
  AND "obligationCents" = "principalCents" + "contractFeeCents"
  AND "principalPaidCents" >= 0 AND "principalPaidCents" <= "principalCents"
  AND "contractFeePaidCents" >= 0 AND "contractFeePaidCents" <= "contractFeeCents"
  AND "lateFeeCents" >= 0 AND "lateFeeCapCents" >= 0
  AND "lateFeesAssessedCents" >= 0 AND "lateFeesAssessedCents" <= "lateFeeCapCents"
  AND "lateFeesPaidCents" >= 0 AND "lateFeesPaidCents" <= "lateFeesAssessedCents"
  AND "installmentCount" > 0 AND "installmentIntervalHours" > 0
);

ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_amounts_valid" CHECK (
  "sequence" > 0 AND "principalCents" >= 0 AND "contractFeeCents" >= 0
  AND "principalPaidCents" >= 0 AND "principalPaidCents" <= "principalCents"
  AND "contractFeePaidCents" >= 0 AND "contractFeePaidCents" <= "contractFeeCents"
);

ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_split_valid" CHECK (
  "amountCents" > 0 AND "lateFeeCents" >= 0 AND "contractFeeCents" >= 0 AND "principalCents" >= 0
  AND "amountCents" = "lateFeeCents" + "contractFeeCents" + "principalCents"
  AND "debtAfterCents" >= 0
);

ALTER TABLE "LoanFee" ADD CONSTRAINT "LoanFee_amount_valid" CHECK (
  "amountCents" >= 0 AND "quotedCents" >= 0 AND "amountCents" <= "quotedCents"
);

ALTER TABLE "LoanEvent" ADD CONSTRAINT "LoanEvent_debt_after_nonnegative" CHECK ("debtAfterCents" >= 0);
