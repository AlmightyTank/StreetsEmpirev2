-- Quest Phase J: durable consumable favor inventory.

CREATE TABLE "PlayerFavor" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "totalGranted" INTEGER NOT NULL DEFAULT 0,
  "lastSourceQuestKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlayerFavor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerFavor_roundPlayerId_key_key"
  ON "PlayerFavor"("roundPlayerId", "key");

CREATE INDEX "PlayerFavor_roundPlayerId_updatedAt_idx"
  ON "PlayerFavor"("roundPlayerId", "updatedAt");

CREATE INDEX "PlayerFavor_key_idx"
  ON "PlayerFavor"("key");

ALTER TABLE "PlayerFavor"
  ADD CONSTRAINT "PlayerFavor_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
