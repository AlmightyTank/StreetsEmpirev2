-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'HEAT_BRIBE';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "heat" INTEGER NOT NULL DEFAULT 0;
