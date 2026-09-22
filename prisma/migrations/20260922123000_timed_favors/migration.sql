-- Quest Phase K: active timed favor state and activity feed event.

ALTER TYPE "ActivityType" ADD VALUE 'FAVOR_ACTIVATED';

CREATE TABLE "PlayerActiveFavor" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "favorKey" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlayerActiveFavor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerActiveFavor_roundPlayerId_category_key"
  ON "PlayerActiveFavor"("roundPlayerId", "category");

CREATE INDEX "PlayerActiveFavor_roundPlayerId_expiresAt_idx"
  ON "PlayerActiveFavor"("roundPlayerId", "expiresAt");

CREATE INDEX "PlayerActiveFavor_expiresAt_idx"
  ON "PlayerActiveFavor"("expiresAt");

ALTER TABLE "PlayerActiveFavor"
  ADD CONSTRAINT "PlayerActiveFavor_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
