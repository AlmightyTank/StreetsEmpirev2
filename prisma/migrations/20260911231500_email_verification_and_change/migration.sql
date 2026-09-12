-- Add account email verification and verified email-change tokens.
CREATE TYPE "AccountEmailTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'CHANGE_EMAIL');

CREATE TABLE "AccountEmailToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "purpose" "AccountEmailTokenPurpose" NOT NULL,
  "newEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "ip" TEXT,

  CONSTRAINT "AccountEmailToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountEmailToken_tokenHash_key" ON "AccountEmailToken"("tokenHash");
CREATE INDEX "AccountEmailToken_accountId_idx" ON "AccountEmailToken"("accountId");
CREATE INDEX "AccountEmailToken_expiresAt_idx" ON "AccountEmailToken"("expiresAt");

ALTER TABLE "AccountEmailToken" ADD CONSTRAINT "AccountEmailToken_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
