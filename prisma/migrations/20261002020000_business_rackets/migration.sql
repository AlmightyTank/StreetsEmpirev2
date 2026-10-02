-- 1.1.0-C: one racket per business, the crew's live racket effects, and laundering caps.
-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'BUSINESS_RACKET';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "launderedDay" TEXT,
ADD COLUMN     "launderedHeatRound" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "launderedHeatToday" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "racketEffects" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "racket" TEXT,
ADD COLUMN     "racketSince" TIMESTAMP(3);

