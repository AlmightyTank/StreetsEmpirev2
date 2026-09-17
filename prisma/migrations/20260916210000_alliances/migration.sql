-- AlterTable
ALTER TABLE "RaidBattle" ADD COLUMN     "defenderAllianceId" TEXT;

-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "allianceCooldownUntil" TIMESTAMP(3),
ADD COLUMN     "allianceId" TEXT,
ADD COLUMN     "allianceJoinedAt" TIMESTAMP(3),
ADD COLUMN     "formerAllianceId" TEXT;

-- CreateTable
CREATE TABLE "Alliance" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "tagNormalized" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "disbandedAt" TIMESTAMP(3),
    "disbandReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceInvite" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "invitedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllianceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceEvent" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorName" TEXT,
    "subjectName" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alliance_roundId_disbandedAt_idx" ON "Alliance"("roundId", "disbandedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_roundId_nameNormalized_key" ON "Alliance"("roundId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_roundId_tagNormalized_key" ON "Alliance"("roundId", "tagNormalized");

-- CreateIndex
CREATE INDEX "AllianceInvite_inviteeId_expiresAt_idx" ON "AllianceInvite"("inviteeId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceInvite_allianceId_inviteeId_key" ON "AllianceInvite"("allianceId", "inviteeId");

-- CreateIndex
CREATE INDEX "AllianceEvent_allianceId_createdAt_idx" ON "AllianceEvent"("allianceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RaidBattle_defenderAllianceId_attackerId_createdAt_idx" ON "RaidBattle"("defenderAllianceId", "attackerId", "createdAt");

-- CreateIndex
CREATE INDEX "RoundPlayer_allianceId_idx" ON "RoundPlayer"("allianceId");

-- AddForeignKey
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alliance" ADD CONSTRAINT "Alliance_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceInvite" ADD CONSTRAINT "AllianceInvite_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceInvite" ADD CONSTRAINT "AllianceInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceEvent" ADD CONSTRAINT "AllianceEvent_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
