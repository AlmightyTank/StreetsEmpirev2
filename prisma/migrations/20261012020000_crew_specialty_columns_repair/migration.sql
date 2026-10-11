-- Repair beta databases that had already applied the original crew roster
-- migration before the specialty columns were added to that migration file.
ALTER TABLE "CrewMember"
  ADD COLUMN IF NOT EXISTS "specialty" "CrewMemberSpecialty" NOT NULL DEFAULT 'GENERALIST';

ALTER TABLE "CrewMember"
  ADD COLUMN IF NOT EXISTS "specialtyExperiencePoints" INTEGER NOT NULL DEFAULT 0;

-- Dealer careers already existed independently of the individual roster. Carry
-- their earned career progress into the roster rows when the columns are added.
UPDATE "CrewMember"
SET "specialty" = 'DEALER',
    "specialtyExperiencePoints" = "experiencePoints"
WHERE "dealerStaffId" IS NOT NULL;
