-- The Drop: account-level Crown wallet, append-only ledger, catalog overrides,
-- scheduled offers, Crown orders, Crown pack orders, settings and admin adjustments.

CREATE TABLE "CrownWallet" (
    "accountId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "heldAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrownWallet_pkey" PRIMARY KEY ("accountId"),
    CONSTRAINT "CrownWallet_balance_nonnegative" CHECK ("balance" >= 0)
);

CREATE TABLE "CrownLedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "roundId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "actorAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrownLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DropCatalogEntry" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'LIVE',
    "priceCrowns" INTEGER,
    "returnPolicy" TEXT NOT NULL DEFAULT 'MAY_RETURN',
    "inDailyPool" BOOLEAN NOT NULL DEFAULT true,
    "homepageSlot" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUsername" TEXT,
    CONSTRAINT "DropCatalogEntry_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "DropOffer" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "priceCrowns" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdByUsername" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DropOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DropOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "actionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "offerId" TEXT,
    "priceCrowns" INTEGER NOT NULL,
    "grantedKeys" TEXT[],
    "roundPlayerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DropOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrownPackOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "packId" TEXT NOT NULL,
    "crowns" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checkoutSessionId" TEXT,
    "providerPaymentId" TEXT,
    "creditedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrownPackOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DropSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "storefrontEnabled" BOOLEAN NOT NULL DEFAULT true,
    "purchasesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "earningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "checkoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "streetPassSkipsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyOfferCount" INTEGER NOT NULL DEFAULT 4,
    "dailyResetHourUtc" INTEGER NOT NULL DEFAULT 0,
    "autoFeatured" BOOLEAN NOT NULL DEFAULT true,
    "roundEarnCap" INTEGER NOT NULL DEFAULT 500,
    "largeAdjustmentThreshold" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUsername" TEXT,
    CONSTRAINT "DropSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrownAdjustmentRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedByUsername" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedByUsername" TEXT,
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "CrownAdjustmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrownLedgerEntry_externalRef_key" ON "CrownLedgerEntry"("externalRef");
CREATE INDEX "CrownLedgerEntry_accountId_createdAt_idx" ON "CrownLedgerEntry"("accountId", "createdAt");
CREATE INDEX "CrownLedgerEntry_accountId_kind_roundId_idx" ON "CrownLedgerEntry"("accountId", "kind", "roundId");
CREATE INDEX "CrownLedgerEntry_kind_createdAt_idx" ON "CrownLedgerEntry"("kind", "createdAt");
CREATE INDEX "DropOffer_startsAt_endsAt_idx" ON "DropOffer"("startsAt", "endsAt");
CREATE INDEX "DropOffer_refKey_idx" ON "DropOffer"("refKey");
CREATE UNIQUE INDEX "DropOrder_accountId_actionId_key" ON "DropOrder"("accountId", "actionId");
CREATE INDEX "DropOrder_accountId_createdAt_idx" ON "DropOrder"("accountId", "createdAt");
CREATE INDEX "DropOrder_createdAt_idx" ON "DropOrder"("createdAt");
CREATE UNIQUE INDEX "CrownPackOrder_checkoutSessionId_key" ON "CrownPackOrder"("checkoutSessionId");
CREATE UNIQUE INDEX "CrownPackOrder_providerPaymentId_key" ON "CrownPackOrder"("providerPaymentId");
CREATE INDEX "CrownPackOrder_accountId_createdAt_idx" ON "CrownPackOrder"("accountId", "createdAt");
CREATE INDEX "CrownPackOrder_status_idx" ON "CrownPackOrder"("status");
CREATE INDEX "CrownAdjustmentRequest_status_createdAt_idx" ON "CrownAdjustmentRequest"("status", "createdAt");
CREATE INDEX "CrownAdjustmentRequest_accountId_createdAt_idx" ON "CrownAdjustmentRequest"("accountId", "createdAt");

ALTER TABLE "CrownWallet" ADD CONSTRAINT "CrownWallet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrownLedgerEntry" ADD CONSTRAINT "CrownLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DropOrder" ADD CONSTRAINT "DropOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrownPackOrder" ADD CONSTRAINT "CrownPackOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrownAdjustmentRequest" ADD CONSTRAINT "CrownAdjustmentRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
