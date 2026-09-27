-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorLastStep" INTEGER,
ADD COLUMN     "twoFactorPendingSecret" TEXT,
ADD COLUMN     "twoFactorSecret" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "twoFactor" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorRecoveryCode_codeHash_key" ON "TwoFactorRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_accountId_idx" ON "TwoFactorRecoveryCode"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LoginChallenge_tokenHash_key" ON "LoginChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "LoginChallenge_accountId_idx" ON "LoginChallenge"("accountId");

-- CreateIndex
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "LoginChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

