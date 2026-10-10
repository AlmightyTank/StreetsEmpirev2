ALTER TYPE "CrewMemberEventKind" ADD VALUE 'TRAINED';

ALTER TABLE "CrewMember"
ADD COLUMN "trainingExperiencePoints" INTEGER NOT NULL DEFAULT 0;
