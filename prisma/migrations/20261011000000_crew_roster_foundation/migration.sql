-- 1.7.0-A. Individual crew members behind the thug and worker counts, their history, and
-- the one-per-player audit of the first roster build. The counts on RoundPlayer stay
-- authoritative; nothing here changes them.
-- CreateEnum
CREATE TYPE "CrewMemberRole" AS ENUM ('THUG', 'WORKER');

-- CreateEnum
CREATE TYPE "CrewMemberStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_TRANSIT', 'RECOVERING', 'RELEASED');

-- CreateEnum
CREATE TYPE "CrewAssignmentKind" AS ENUM ('BUSINESS', 'DEALER', 'TURF');

-- CreateEnum
CREATE TYPE "CrewMemberEventKind" AS ENUM ('MIGRATED', 'JOINED', 'ASSIGNED', 'UNASSIGNED', 'RELEASED', 'REHIRED');

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "role" "CrewMemberRole" NOT NULL,
    "serial" INTEGER NOT NULL,
    "status" "CrewMemberStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assignmentKind" "CrewAssignmentKind",
    "assignmentRef" TEXT,
    "experiencePoints" INTEGER NOT NULL DEFAULT 0,
    "dealerStaffId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "statusSince" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMemberEvent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "kind" "CrewMemberEventKind" NOT NULL,
    "assignmentKind" "CrewAssignmentKind",
    "assignmentRef" TEXT,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewMemberEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewRosterMigration" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "membersCreated" INTEGER NOT NULL,
    "dealerCareers" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewRosterMigration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_dealerStaffId_key" ON "CrewMember"("dealerStaffId");

-- CreateIndex
CREATE INDEX "CrewMember_roundPlayerId_role_status_idx" ON "CrewMember"("roundPlayerId", "role", "status");

-- CreateIndex
CREATE INDEX "CrewMember_roundPlayerId_assignmentKind_assignmentRef_idx" ON "CrewMember"("roundPlayerId", "assignmentKind", "assignmentRef");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_roundPlayerId_serial_key" ON "CrewMember"("roundPlayerId", "serial");

-- CreateIndex
CREATE INDEX "CrewMemberEvent_memberId_at_idx" ON "CrewMemberEvent"("memberId", "at");

-- CreateIndex
CREATE INDEX "CrewMemberEvent_roundPlayerId_at_idx" ON "CrewMemberEvent"("roundPlayerId", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CrewRosterMigration_roundPlayerId_key" ON "CrewRosterMigration"("roundPlayerId");

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_dealerStaffId_fkey" FOREIGN KEY ("dealerStaffId") REFERENCES "DealerStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMemberEvent" ADD CONSTRAINT "CrewMemberEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CrewMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMemberEvent" ADD CONSTRAINT "CrewMemberEvent_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRosterMigration" ADD CONSTRAINT "CrewRosterMigration_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_serial_positive" CHECK ("serial" > 0);
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_experience_nonnegative" CHECK ("experiencePoints" >= 0);
-- Assigned members say to what; nobody else carries an assignment.
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_assignment_matches_status" CHECK (
    ("status" = 'ASSIGNED') = ("assignmentKind" IS NOT NULL)
);
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_released_at_matches_status" CHECK (
    ("status" = 'RELEASED') = ("releasedAt" IS NOT NULL)
);
