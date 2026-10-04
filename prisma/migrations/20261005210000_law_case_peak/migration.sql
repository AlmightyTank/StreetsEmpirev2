-- StreetsEmpire 1.3.0-F: a Case remembers its highest stage since it last left Quiet, and when
-- it left Quiet, so a Case cooling back to Quiet can say how far it had got. Existing Cases
-- start from their current stage, opened when the row was made.

-- AlterTable
ALTER TABLE "PlayerCase" ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "peakStage" TEXT NOT NULL DEFAULT 'QUIET';

UPDATE "PlayerCase" SET "peakStage" = "stage", "openedAt" = "createdAt" WHERE "stage" <> 'QUIET';
