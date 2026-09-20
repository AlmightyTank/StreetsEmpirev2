-- 0.6.0-B. Turf holding actions and the per-payer holder tax cap.
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_CLAIM';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_POST';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TURF_PULL';

CREATE TABLE "TurfTaxLedger" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "mintedCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurfTaxLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TurfTaxLedger_roundId_payerId_holderId_day_key" ON "TurfTaxLedger"("roundId", "payerId", "holderId", "day");
CREATE INDEX "TurfTaxLedger_roundId_holderId_day_idx" ON "TurfTaxLedger"("roundId", "holderId", "day");

ALTER TABLE "TurfTaxLedger" ADD CONSTRAINT "TurfTaxLedger_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfTaxLedger" ADD CONSTRAINT "TurfTaxLedger_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfTaxLedger" ADD CONSTRAINT "TurfTaxLedger_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfTaxLedger" ADD CONSTRAINT "TurfTaxLedger_minted_check" CHECK ("mintedCents" >= 0);
