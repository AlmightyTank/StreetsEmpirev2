-- The Ring: one ring per round, invisibility on its bearer, destroyed at the Detroit foundry.
ALTER TABLE "RoundPlayer" ADD COLUMN IF NOT EXISTS "invisibleUntil" TIMESTAMPTZ;

DO $$ BEGIN
  CREATE TYPE "RingStatus" AS ENUM ('HIDDEN', 'SURFACED', 'DESTROYED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RingState" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "status" "RingStatus" NOT NULL DEFAULT 'SURFACED',
  "holderRoundPlayerId" TEXT,
  "surfacedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "destroyedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "RingState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RingState_roundId_key" ON "RingState"("roundId");
CREATE INDEX IF NOT EXISTS "RingState_roundId_idx" ON "RingState"("roundId");

DO $$ BEGIN
  ALTER TABLE "RingState" ADD CONSTRAINT "RingState_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RingState" ADD CONSTRAINT "RingState_holderRoundPlayerId_fkey" FOREIGN KEY ("holderRoundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'RING_SURFACED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'RING_STOLEN';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'RING_DESTROYED';
