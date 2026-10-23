-- Shared beta/live Drop entitlement store.
-- This migration is applied to the canonical entitlement database as well as
-- the gameplay database so both deployments use the same generated client.

CREATE TABLE "SharedEntitlementAccount" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SharedEntitlementAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedEntitlementAccount_identityKey_key" ON "SharedEntitlementAccount"("identityKey");

CREATE TABLE "SharedEntitlementLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "localAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedEntitlementLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedEntitlementLink_environment_localAccountId_key" ON "SharedEntitlementLink"("environment", "localAccountId");
CREATE INDEX "SharedEntitlementLink_accountId_idx" ON "SharedEntitlementLink"("accountId");

CREATE TABLE "SharedCrownWallet" (
    "accountId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "heldAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SharedCrownWallet_pkey" PRIMARY KEY ("accountId")
);

CREATE TABLE "SharedCrownLedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "localAccountId" TEXT,
    "roundId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedCrownLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedCrownLedgerEntry_externalRef_key" ON "SharedCrownLedgerEntry"("externalRef");
CREATE INDEX "SharedCrownLedgerEntry_accountId_createdAt_idx" ON "SharedCrownLedgerEntry"("accountId", "createdAt");

CREATE TABLE "SharedCosmeticUnlock" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "styleKey" TEXT,
    "source" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "localAccountId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedCosmeticUnlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedCosmeticUnlock_accountId_key_key" ON "SharedCosmeticUnlock"("accountId", "key");
CREATE INDEX "SharedCosmeticUnlock_accountId_awardedAt_idx" ON "SharedCosmeticUnlock"("accountId", "awardedAt");

CREATE TABLE "SharedEntitlementPurchase" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "localOrderId" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "kind" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "crownsDelta" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedEntitlementPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedEntitlementPurchase_environment_localOrderId_key" ON "SharedEntitlementPurchase"("environment", "localOrderId");
CREATE INDEX "SharedEntitlementPurchase_accountId_createdAt_idx" ON "SharedEntitlementPurchase"("accountId", "createdAt");
CREATE INDEX "SharedEntitlementPurchase_provider_providerRef_idx" ON "SharedEntitlementPurchase"("provider", "providerRef");

ALTER TABLE "SharedCrownWallet" ADD CONSTRAINT "SharedCrownWallet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SharedEntitlementAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedEntitlementLink" ADD CONSTRAINT "SharedEntitlementLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SharedEntitlementAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedCrownLedgerEntry" ADD CONSTRAINT "SharedCrownLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SharedEntitlementAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedCosmeticUnlock" ADD CONSTRAINT "SharedCosmeticUnlock_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SharedEntitlementAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedEntitlementPurchase" ADD CONSTRAINT "SharedEntitlementPurchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SharedEntitlementAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
