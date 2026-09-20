ALTER TABLE "Turf"
  ADD COLUMN "localsReclaimAt" TIMESTAMP(3);

ALTER TABLE "TurfPush"
  ADD COLUMN "attackerAllianceId" TEXT,
  ADD COLUMN "defenderAllianceId" TEXT,
  ADD COLUMN "captured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "discordPostedAt" TIMESTAMP(3);

CREATE INDEX "TurfPush_roundId_captured_settledAt_idx"
  ON "TurfPush"("roundId", "captured", "settledAt" DESC);

CREATE INDEX "TurfPush_attackerId_captured_settledAt_idx"
  ON "TurfPush"("attackerId", "captured", "settledAt" DESC);

CREATE INDEX "TurfPush_defenderAllianceId_attackerId_captured_settledAt_idx"
  ON "TurfPush"("defenderAllianceId", "attackerId", "captured", "settledAt" DESC);
