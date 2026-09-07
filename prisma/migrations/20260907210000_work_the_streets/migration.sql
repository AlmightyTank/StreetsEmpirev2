-- Work the Streets: earning money becomes its own action, and happiness stops
-- being a pure function of the shelves. Fatigue is wear the crew carries with
-- them - climbing when they work for a cut that does not justify it, falling
-- when they are paid well or left to rest.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'WORK_STREETS';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "thugFatigue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whoreFatigue" INTEGER NOT NULL DEFAULT 0;
