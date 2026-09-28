-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "rulesAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "rulesAcceptedVersion" TEXT,
ADD COLUMN     "verificationGrandfatheredAt" TIMESTAMP(3);


-- Everyone who already has an account when email verification starts being required
-- keeps playing without verifying. Only accounts created from here on must verify
-- (or use Discord).
UPDATE "Account" SET "verificationGrandfatheredAt" = CURRENT_TIMESTAMP WHERE "verificationGrandfatheredAt" IS NULL;
