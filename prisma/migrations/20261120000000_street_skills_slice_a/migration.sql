CREATE TABLE "PlayerSkill" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "choices" JSONB NOT NULL DEFAULT '{}',
    "xpWindowStartsAt" TIMESTAMP(3),
    "xpInWindow" INTEGER NOT NULL DEFAULT 0,
    "respecs" INTEGER NOT NULL DEFAULT 0,
    "respecReadyAt" TIMESTAMP(3),
    CONSTRAINT "PlayerSkill_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlayerSkillAward" (
    "id" TEXT NOT NULL,
    "playerSkillId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerSkillAward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerSkill_roundPlayerId_skill_key" ON "PlayerSkill"("roundPlayerId", "skill");
CREATE INDEX "PlayerSkill_roundPlayerId_idx" ON "PlayerSkill"("roundPlayerId");
CREATE UNIQUE INDEX "PlayerSkillAward_roundPlayerId_sourceKey_key" ON "PlayerSkillAward"("roundPlayerId", "sourceKey");
CREATE INDEX "PlayerSkillAward_playerSkillId_awardedAt_idx" ON "PlayerSkillAward"("playerSkillId", "awardedAt");
ALTER TABLE "PlayerSkill" ADD CONSTRAINT "PlayerSkill_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerSkillAward" ADD CONSTRAINT "PlayerSkillAward_playerSkillId_fkey" FOREIGN KEY ("playerSkillId") REFERENCES "PlayerSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerSkillAward" ADD CONSTRAINT "PlayerSkillAward_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
