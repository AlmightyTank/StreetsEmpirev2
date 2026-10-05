-- StreetsEmpire: auto-accept board work (daily, weekly, city), on by default.

-- AlterTable
ALTER TABLE "AccountProfile" ADD COLUMN "autoAcceptBoardWork" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PlayerQuest" ADD COLUMN "abandonedAt" TIMESTAMP(3);
