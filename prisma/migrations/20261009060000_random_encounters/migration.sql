-- 1.6.0-F. Durable action-triggered street encounters.
CREATE TABLE "RandomEncounter" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESOLVED',
    "effects" JSONB NOT NULL DEFAULT '{}',
    "choices" JSONB NOT NULL DEFAULT '[]',
    "selectedChoice" TEXT,
    "result" JSONB,
    "sourceActivityId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RandomEncounter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RandomEncounter_roundPlayerId_status_createdAt_idx" ON "RandomEncounter"("roundPlayerId", "status", "createdAt" DESC);
CREATE INDEX "RandomEncounter_roundPlayerId_trigger_createdAt_idx" ON "RandomEncounter"("roundPlayerId", "trigger", "createdAt" DESC);
CREATE INDEX "RandomEncounter_expiresAt_status_idx" ON "RandomEncounter"("expiresAt", "status");

ALTER TABLE "RandomEncounter" ADD CONSTRAINT "RandomEncounter_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
