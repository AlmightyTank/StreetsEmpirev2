-- 2.0.0 empire-story-2-0: permanent, cosmetic-only Empire Legacy receipts.

ALTER TABLE "AccountProfile"
  ADD COLUMN "featuredLegacyEntryId" TEXT;

CREATE TABLE "LegacyEntry" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "sourceRoundId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "coverNewsId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LegacyEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegacyEntry_idempotencyKey_key"
  ON "LegacyEntry"("idempotencyKey");
CREATE INDEX "LegacyEntry_accountId_awardedAt_idx"
  ON "LegacyEntry"("accountId", "awardedAt" DESC);
CREATE INDEX "LegacyEntry_sourceRoundId_kind_idx"
  ON "LegacyEntry"("sourceRoundId", "kind");

ALTER TABLE "LegacyEntry"
  ADD CONSTRAINT "LegacyEntry_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegacyEntry"
  ADD CONSTRAINT "LegacyEntry_sourceRoundId_fkey"
  FOREIGN KEY ("sourceRoundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
