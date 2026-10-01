-- AlterTable
ALTER TABLE "LoginChallenge" ADD COLUMN     "remember" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "absoluteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "codeFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "remember" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "secondFactorAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_accountId_idx" ON "TrustedDevice"("accountId");

-- CreateIndex
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sessions that already proved a second factor keep it from when they signed in.
UPDATE "Session" SET "secondFactorAt" = "createdAt" WHERE "method" = 'DISCORD' OR "twoFactor" = true;
