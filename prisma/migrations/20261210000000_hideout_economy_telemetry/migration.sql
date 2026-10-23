CREATE TABLE "HideoutEconomyTelemetry" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "itemKey" TEXT,
    "quantity" INTEGER,
    "rarity" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HideoutEconomyTelemetry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HideoutEconomyTelemetry_roundPlayerId_event_createdAt_idx" ON "HideoutEconomyTelemetry"("roundPlayerId", "event", "createdAt" DESC);
CREATE INDEX "HideoutEconomyTelemetry_roundPlayerId_itemKey_createdAt_idx" ON "HideoutEconomyTelemetry"("roundPlayerId", "itemKey", "createdAt" DESC);
ALTER TABLE "HideoutEconomyTelemetry" ADD CONSTRAINT "HideoutEconomyTelemetry_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
