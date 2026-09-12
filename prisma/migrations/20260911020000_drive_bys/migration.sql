-- Drive-bys share the battle receipt table with raids.
CREATE TYPE "BattleKind" AS ENUM ('RAID', 'DRIVE_BY');
ALTER TABLE "RaidBattle" ADD COLUMN "kind" "BattleKind" NOT NULL DEFAULT 'RAID';

ALTER TYPE "ActivityType" ADD VALUE 'DRIVE_BY_ATTACK';
ALTER TYPE "ActivityType" ADD VALUE 'DRIVE_BY_DEFENSE';

ALTER TABLE "RoundPlayer"
  ADD COLUMN "driveBysDone" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "driveByCooldownUntil" TIMESTAMP(3),
  ADD COLUMN "driveByProtectedUntil" TIMESTAMP(3),
  ADD COLUMN "lastDrivenByAt" TIMESTAMP(3);
