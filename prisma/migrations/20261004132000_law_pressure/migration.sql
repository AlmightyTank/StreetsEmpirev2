-- 1.3.0-F: persisted law attention and evidence pressure.
ALTER TABLE "RoundPlayer"
  ADD COLUMN "lawAttention" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lawEvidence" INTEGER NOT NULL DEFAULT 0;

ALTER TYPE "ActivityType" ADD VALUE 'LAW_CORRUPTION';
