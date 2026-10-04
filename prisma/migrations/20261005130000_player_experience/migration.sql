ALTER TABLE "Account"
ADD COLUMN "experiencePoints" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PlayerExperienceEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerExperienceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerExperienceEvent_accountId_sourceKey_key"
ON "PlayerExperienceEvent"("accountId", "sourceKey");

CREATE INDEX "PlayerExperienceEvent_accountId_awardedAt_idx"
ON "PlayerExperienceEvent"("accountId", "awardedAt" DESC);

ALTER TABLE "PlayerExperienceEvent"
ADD CONSTRAINT "PlayerExperienceEvent_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
