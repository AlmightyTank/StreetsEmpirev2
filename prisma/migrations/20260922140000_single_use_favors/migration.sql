-- Quest Phase L: armed single-use favor state.

ALTER TYPE "ActivityType" ADD VALUE 'FAVOR_ARMED';
ALTER TYPE "ActivityType" ADD VALUE 'FAVOR_DISARMED';

CREATE TABLE "PlayerArmedFavor" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "favorKey" TEXT NOT NULL,
  "armedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerArmedFavor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerArmedFavor_roundPlayerId_category_key"
  ON "PlayerArmedFavor"("roundPlayerId", "category");
CREATE INDEX "PlayerArmedFavor_roundPlayerId_favorKey_idx"
  ON "PlayerArmedFavor"("roundPlayerId", "favorKey");

ALTER TABLE "PlayerArmedFavor"
  ADD CONSTRAINT "PlayerArmedFavor_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
