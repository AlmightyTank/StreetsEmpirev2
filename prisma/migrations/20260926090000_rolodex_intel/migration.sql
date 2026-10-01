-- 0.9.0-D: explicit rolodex contact lanes.

ALTER TABLE "PlayerContact"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CONTACT';

CREATE INDEX "PlayerContact_ownerId_kind_updatedAt_idx"
  ON "PlayerContact"("ownerId", "kind", "updatedAt" DESC);
