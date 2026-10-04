-- StreetsEmpire 1.3.0-A: per-city Case and itemised, retry-safe Case receipts.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'CASE_STAGE_UP';

-- CreateTable
CREATE TABLE "PlayerCase" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "caseHundredths" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'QUIET',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCaseReceipt" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "heat" DOUBLE PRECISION NOT NULL,
    "deltaHundredths" INTEGER NOT NULL,
    "caseAfterHundredths" INTEGER NOT NULL,
    "stageAfter" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerCaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerCase_cityId_idx" ON "PlayerCase"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCase_roundPlayerId_cityId_key" ON "PlayerCase"("roundPlayerId", "cityId");

-- CreateIndex
CREATE INDEX "PlayerCaseReceipt_roundPlayerId_createdAt_idx" ON "PlayerCaseReceipt"("roundPlayerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlayerCaseReceipt_roundPlayerId_cityId_createdAt_idx" ON "PlayerCaseReceipt"("roundPlayerId", "cityId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCaseReceipt_roundPlayerId_sourceKey_key" ON "PlayerCaseReceipt"("roundPlayerId", "sourceKey");

-- AddForeignKey
ALTER TABLE "PlayerCase" ADD CONSTRAINT "PlayerCase_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCase" ADD CONSTRAINT "PlayerCase_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCaseReceipt" ADD CONSTRAINT "PlayerCaseReceipt_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCaseReceipt" ADD CONSTRAINT "PlayerCaseReceipt_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
