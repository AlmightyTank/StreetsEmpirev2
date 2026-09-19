-- 0.5.0-D. Relocation: moving the whole operation to another city, and the time on the
-- road before the player's city changes.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'RELOCATION_STARTED';
ALTER TYPE "ActivityType" ADD VALUE 'RELOCATED';

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "movingUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Relocation" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "feeCents" BIGINT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "arrivedAt" TIMESTAMP(3),

    CONSTRAINT "Relocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Relocation_roundPlayerId_startedAt_idx" ON "Relocation"("roundPlayerId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "Relocation_arrivedAt_arrivesAt_idx" ON "Relocation"("arrivedAt", "arrivesAt");

-- AddForeignKey
ALTER TABLE "Relocation" ADD CONSTRAINT "Relocation_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A move costs something or nothing, goes somewhere new, and arrives after it starts;
-- a player has at most one move on the road.
ALTER TABLE "Relocation" ADD CONSTRAINT "Relocation_move_check" CHECK ("feeCents" >= 0 AND "fromCity" <> "toCity" AND "arrivesAt" >= "startedAt");
CREATE UNIQUE INDEX "Relocation_one_pending" ON "Relocation"("roundPlayerId") WHERE "arrivedAt" IS NULL;
