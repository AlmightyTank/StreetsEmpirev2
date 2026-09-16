-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "suspendedByUsername" TEXT,
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "suspendedUntil" TIMESTAMP(3);
