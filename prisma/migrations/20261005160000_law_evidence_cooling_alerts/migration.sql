-- StreetsEmpire 1.3.0-B: Case cooling clock, currency-report day totals, laundering's Case cap,
-- and the Case-stage alert category with its per-receipt collection marker.

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "lawEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PlayerCase" ADD COLUMN     "caseAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastEvidenceAt" TIMESTAMP(3),
ADD COLUMN     "reportCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "reportDay" TEXT;

-- AlterTable
ALTER TABLE "PlayerCaseReceipt" ADD COLUMN     "alertsCollectedAt" TIMESTAMP(3),
ADD COLUMN     "stageUp" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "launderedCaseDay" TEXT,
ADD COLUMN     "launderedCaseToday" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "PlayerCaseReceipt_stageUp_alertsCollectedAt_idx" ON "PlayerCaseReceipt"("stageUp", "alertsCollectedAt");

-- A 1.3.0-A Case was last brought up to date, and last added to, when its row last changed.
UPDATE "PlayerCase" SET "caseAt" = "updatedAt", "lastEvidenceAt" = "updatedAt";
