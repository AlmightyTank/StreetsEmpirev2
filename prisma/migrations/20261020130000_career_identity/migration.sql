-- Cosmetic criminal career identity. No round-player or gameplay-stat columns are added.
CREATE TABLE "PlayerCareer" (
    "accountId" TEXT NOT NULL,
    "career" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "switchAvailableAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerCareer_pkey" PRIMARY KEY ("accountId")
);

CREATE INDEX "PlayerCareer_career_idx" ON "PlayerCareer"("career");

ALTER TABLE "PlayerCareer" ADD CONSTRAINT "PlayerCareer_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'RANDOM_ENCOUNTER_CHOICE';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CAREER_CHOSEN';
