CREATE TYPE "CrewMemberSpecialty" AS ENUM ('GENERALIST', 'ENFORCER', 'WHEELMAN', 'SCOUT', 'DEALER', 'SERVICE');

ALTER TABLE "CrewMember"
  ADD COLUMN "specialty" "CrewMemberSpecialty" NOT NULL DEFAULT 'GENERALIST',
  ADD COLUMN "specialtyExperiencePoints" INTEGER NOT NULL DEFAULT 0;

UPDATE "CrewMember"
SET "specialty" = 'DEALER', "specialtyExperiencePoints" = "experiencePoints"
WHERE "dealerStaffId" IS NOT NULL;

ALTER TABLE "Run" ADD COLUMN "wheelmanBonusPercent" INTEGER NOT NULL DEFAULT 0;
