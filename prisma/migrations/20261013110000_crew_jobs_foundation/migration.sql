-- 1.8.6-A: inert foundation for named crew job assignments.
ALTER TYPE "CrewAssignmentKind" ADD VALUE IF NOT EXISTS 'CORNER_ENFORCER';
ALTER TYPE "CrewAssignmentKind" ADD VALUE IF NOT EXISTS 'CORNER_LOOKOUT';
ALTER TYPE "CrewAssignmentKind" ADD VALUE IF NOT EXISTS 'STASH_GUARD';
ALTER TYPE "CrewAssignmentKind" ADD VALUE IF NOT EXISTS 'RUNNER';
ALTER TYPE "CrewAssignmentKind" ADD VALUE IF NOT EXISTS 'BODYGUARD';
ALTER TYPE "CrewAssignmentKind" ADD VALUE IF NOT EXISTS 'ESCORT';

CREATE TYPE "CrewJobPostKind" AS ENUM (
  'CORNER_ENFORCER',
  'CORNER_LOOKOUT',
  'STASH_GUARD',
  'RUNNER',
  'BODYGUARD',
  'ESCORT'
);

CREATE TABLE "CrewJobPost" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "kind" "CrewJobPostKind" NOT NULL,
    "targetRef" TEXT,
    "citySlug" TEXT,
    "districtKey" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrewJobPost_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CrewJobPost" ADD CONSTRAINT "CrewJobPost_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CrewJobPost_roundPlayerId_kind_isActive_idx" ON "CrewJobPost"("roundPlayerId", "kind", "isActive");
CREATE INDEX "CrewJobPost_roundPlayerId_targetRef_idx" ON "CrewJobPost"("roundPlayerId", "targetRef");
