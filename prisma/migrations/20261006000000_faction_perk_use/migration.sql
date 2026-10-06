-- StreetsEmpire 1.4.0-D: a receipt for every Connected faction nudge that takes effect.

-- CreateTable
CREATE TABLE "PlayerFactionPerkUse" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "factionKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "saved" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerFactionPerkUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerFactionPerkUse_roundPlayerId_factionKey_createdAt_idx" ON "PlayerFactionPerkUse"("roundPlayerId", "factionKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerFactionPerkUse_roundPlayerId_sourceKey_key" ON "PlayerFactionPerkUse"("roundPlayerId", "sourceKey");

-- AddForeignKey
ALTER TABLE "PlayerFactionPerkUse" ADD CONSTRAINT "PlayerFactionPerkUse_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
