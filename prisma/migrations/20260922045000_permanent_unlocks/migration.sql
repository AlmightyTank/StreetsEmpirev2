-- Quest Phase I: generic permanent per-round unlock ledger.

CREATE TABLE "PlayerUnlock" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "sourceQuestKey" TEXT,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlayerUnlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerUnlock_roundPlayerId_key_key"
  ON "PlayerUnlock"("roundPlayerId", "key");

CREATE INDEX "PlayerUnlock_roundPlayerId_awardedAt_idx"
  ON "PlayerUnlock"("roundPlayerId", "awardedAt");

CREATE INDEX "PlayerUnlock_key_idx"
  ON "PlayerUnlock"("key");

ALTER TABLE "PlayerUnlock"
  ADD CONSTRAINT "PlayerUnlock_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
