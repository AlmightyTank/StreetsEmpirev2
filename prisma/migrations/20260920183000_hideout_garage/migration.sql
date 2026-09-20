-- 0.6.0-D: a one-level Garage unlocks the second active run.
ALTER TABLE "RoundPlayer"
  ADD COLUMN "hideoutGarageLevel" INTEGER NOT NULL DEFAULT 0;
