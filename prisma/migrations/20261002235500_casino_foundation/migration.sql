-- StreetsEmpire 1.2.0-A: casino city wallets, bankroll sessions and retry-safe ledger.

ALTER TYPE "ActivityType" ADD VALUE 'CASINO_BUY_CHIPS';
ALTER TYPE "ActivityType" ADD VALUE 'CASINO_REDEEM_CHIPS';
ALTER TYPE "ActivityType" ADD VALUE 'CASINO_SESSION_OPENED';
ALTER TYPE "ActivityType" ADD VALUE 'CASINO_SESSION_CLOSED';

CREATE TABLE "CasinoWallet" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "chipsCents" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CasinoSession" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "bankrollCents" BIGINT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CasinoLedgerEntry" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "sessionId" TEXT,
  "actionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "cashDeltaCents" BIGINT NOT NULL DEFAULT 0,
  "walletChipDeltaCents" BIGINT NOT NULL DEFAULT 0,
  "sessionChipDeltaCents" BIGINT NOT NULL DEFAULT 0,
  "walletChipsAfterCents" BIGINT NOT NULL,
  "sessionChipsAfterCents" BIGINT NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasinoLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasinoWallet_roundPlayerId_cityId_key" ON "CasinoWallet"("roundPlayerId", "cityId");
CREATE INDEX "CasinoWallet_cityId_idx" ON "CasinoWallet"("cityId");
CREATE INDEX "CasinoSession_roundPlayerId_status_openedAt_idx" ON "CasinoSession"("roundPlayerId", "status", "openedAt" DESC);
CREATE INDEX "CasinoSession_cityId_status_idx" ON "CasinoSession"("cityId", "status");
CREATE UNIQUE INDEX "CasinoSession_one_open_per_player" ON "CasinoSession"("roundPlayerId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "CasinoLedgerEntry_roundPlayerId_actionId_key" ON "CasinoLedgerEntry"("roundPlayerId", "actionId");
CREATE INDEX "CasinoLedgerEntry_roundPlayerId_createdAt_idx" ON "CasinoLedgerEntry"("roundPlayerId", "createdAt" DESC);
CREATE INDEX "CasinoLedgerEntry_sessionId_createdAt_idx" ON "CasinoLedgerEntry"("sessionId", "createdAt");
CREATE INDEX "CasinoLedgerEntry_cityId_createdAt_idx" ON "CasinoLedgerEntry"("cityId", "createdAt" DESC);

ALTER TABLE "CasinoWallet" ADD CONSTRAINT "CasinoWallet_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoWallet" ADD CONSTRAINT "CasinoWallet_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoSession" ADD CONSTRAINT "CasinoSession_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoSession" ADD CONSTRAINT "CasinoSession_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoLedgerEntry" ADD CONSTRAINT "CasinoLedgerEntry_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoLedgerEntry" ADD CONSTRAINT "CasinoLedgerEntry_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasinoLedgerEntry" ADD CONSTRAINT "CasinoLedgerEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CasinoSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
