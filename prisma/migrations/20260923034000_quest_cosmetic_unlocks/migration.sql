-- Phase Y-C: permanent account-owned cosmetics earned from one-time Jobs.
CREATE TABLE "AccountCosmeticUnlock" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "sourceQuestKey" TEXT NOT NULL,
    "sourceRulesetId" TEXT NOT NULL,
    "sourceRulesetVersion" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountCosmeticUnlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountCosmeticUnlock_accountId_key_key"
ON "AccountCosmeticUnlock"("accountId", "key");

CREATE INDEX "AccountCosmeticUnlock_accountId_awardedAt_idx"
ON "AccountCosmeticUnlock"("accountId", "awardedAt");

CREATE INDEX "AccountCosmeticUnlock_key_idx"
ON "AccountCosmeticUnlock"("key");

ALTER TABLE "AccountCosmeticUnlock"
ADD CONSTRAINT "AccountCosmeticUnlock_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
