-- 0.7.0-E Back Office ledger.
CREATE TABLE "EconomyLedgerEntry" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomyLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EconomyLedgerEntry_roundPlayerId_createdAt_idx"
ON "EconomyLedgerEntry"("roundPlayerId", "createdAt" DESC);

ALTER TABLE "EconomyLedgerEntry"
ADD CONSTRAINT "EconomyLedgerEntry_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
