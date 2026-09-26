-- 1.0.0-B: per-account tutorial progress (intro, page intros, early guide).

-- AlterTable
ALTER TABLE "AccountProfile" ADD COLUMN     "onboarding" JSONB NOT NULL DEFAULT '{}';

