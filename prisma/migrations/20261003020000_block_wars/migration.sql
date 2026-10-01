-- 1.1.0-D: block wars, their fights and committed squads; war fatigue, the siege and the
-- ally's cut on the block; torching on the business.
-- CreateEnum
CREATE TYPE "BlockWarGoal" AS ENUM ('TAKE', 'SACK');

-- CreateEnum
CREATE TYPE "BlockWarStatus" AS ENUM ('OPENING', 'SIEGE', 'BETWEEN', 'ENDED');

-- CreateEnum
CREATE TYPE "BlockWarSide" AS ENUM ('ATTACKER', 'DEFENDER');

-- CreateEnum
CREATE TYPE "BlockWarFightKind" AS ENUM ('OPENING', 'ASSAULT', 'BREAK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'BUSINESS_TORCH';
ALTER TYPE "ActivityType" ADD VALUE 'BLOCK_WAR_DECLARED';
ALTER TYPE "ActivityType" ADD VALUE 'BLOCK_WAR_FIGHT';
ALTER TYPE "ActivityType" ADD VALUE 'BLOCK_WAR_ENDED';
ALTER TYPE "ActivityType" ADD VALUE 'BLOCK_WAR_CALL';

-- AlterTable
ALTER TABLE "Turf" ADD COLUMN     "capturedAts" TIMESTAMP(3)[],
ADD COLUMN     "fatigue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fatigueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "siegedSince" TIMESTAMP(3),
ADD COLUMN     "warCutPlayerId" TEXT,
ADD COLUMN     "warCutShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "warCutUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "torchById" TEXT,
ADD COLUMN     "torchUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BlockWar" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "turfId" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "attackerAllianceId" TEXT,
    "defenderId" TEXT NOT NULL,
    "defenderAllianceId" TEXT,
    "goal" "BlockWarGoal" NOT NULL,
    "status" "BlockWarStatus" NOT NULL DEFAULT 'OPENING',
    "actionId" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL,
    "endsBy" TIMESTAMP(3) NOT NULL,
    "control" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "controlAt" TIMESTAMP(3),
    "siegeSince" TIMESTAMP(3),
    "siegeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fights" INTEGER NOT NULL DEFAULT 0,
    "nextAssaultAt" TIMESTAMP(3),
    "fatigueAtStart" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackerAllyId" TEXT,
    "defenderAllyId" TEXT,
    "attackerCut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defenderCut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackerCallUntil" TIMESTAMP(3),
    "defenderCallUntil" TIMESTAMP(3),
    "attackerAllyFought" BOOLEAN NOT NULL DEFAULT false,
    "defenderAllyFought" BOOLEAN NOT NULL DEFAULT false,
    "winner" "BlockWarSide",
    "endReason" TEXT,
    "endedAt" TIMESTAMP(3),
    "result" JSONB,

    CONSTRAINT "BlockWar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockWarFight" (
    "id" TEXT NOT NULL,
    "warId" TEXT NOT NULL,
    "kind" "BlockWarFightKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "landsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,

    CONSTRAINT "BlockWarFight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockWarSquad" (
    "id" TEXT NOT NULL,
    "warId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "side" "BlockWarSide" NOT NULL,
    "role" TEXT NOT NULL,
    "fightId" TEXT,
    "sent" INTEGER NOT NULL,
    "thugs" INTEGER NOT NULL,
    "wounded" INTEGER NOT NULL DEFAULT 0,
    "crew" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "recoverAt" TIMESTAMP(3),
    "posted" INTEGER NOT NULL DEFAULT 0,
    "payoutCents" BIGINT NOT NULL DEFAULT 0,
    "heat" INTEGER NOT NULL DEFAULT 0,
    "creditedThugs" INTEGER NOT NULL DEFAULT 0,
    "creditedWounded" INTEGER NOT NULL DEFAULT 0,
    "gunsCreditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockWarSquad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockWar_turfId_status_idx" ON "BlockWar"("turfId", "status");

-- CreateIndex
CREATE INDEX "BlockWar_roundId_status_idx" ON "BlockWar"("roundId", "status");

-- CreateIndex
CREATE INDEX "BlockWar_attackerId_status_idx" ON "BlockWar"("attackerId", "status");

-- CreateIndex
CREATE INDEX "BlockWar_defenderId_status_idx" ON "BlockWar"("defenderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BlockWar_attackerId_actionId_key" ON "BlockWar"("attackerId", "actionId");

-- CreateIndex
CREATE INDEX "BlockWarFight_warId_status_idx" ON "BlockWarFight"("warId", "status");

-- CreateIndex
CREATE INDEX "BlockWarSquad_playerId_active_idx" ON "BlockWarSquad"("playerId", "active");

-- CreateIndex
CREATE INDEX "BlockWarSquad_warId_active_idx" ON "BlockWarSquad"("warId", "active");

-- AddForeignKey
ALTER TABLE "BlockWar" ADD CONSTRAINT "BlockWar_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockWar" ADD CONSTRAINT "BlockWar_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockWar" ADD CONSTRAINT "BlockWar_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockWar" ADD CONSTRAINT "BlockWar_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockWarFight" ADD CONSTRAINT "BlockWarFight_warId_fkey" FOREIGN KEY ("warId") REFERENCES "BlockWar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockWarSquad" ADD CONSTRAINT "BlockWarSquad_warId_fkey" FOREIGN KEY ("warId") REFERENCES "BlockWar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockWarSquad" ADD CONSTRAINT "BlockWarSquad_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

