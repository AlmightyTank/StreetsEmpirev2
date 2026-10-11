-- The roster table is introduced by the later 1.7.0-A migration. Keep the
-- specialty enum here so the foundation migration can use it when it creates
-- CrewMember.
DO $$
BEGIN
  CREATE TYPE "CrewMemberSpecialty" AS ENUM ('GENERALIST', 'ENFORCER', 'WHEELMAN', 'SCOUT', 'DEALER', 'SERVICE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Run predates the individual crew roster and can be updated immediately.
ALTER TABLE "Run"
  ADD COLUMN IF NOT EXISTS "wheelmanBonusPercent" INTEGER NOT NULL DEFAULT 0;
