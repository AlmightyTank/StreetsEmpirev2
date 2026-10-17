-- 2.1.0-D. Private round-only mentor links and proof-backed shared memories.
CREATE TABLE "CrewMentorBond" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "mentorId" TEXT NOT NULL,
  "apprenticeId" TEXT NOT NULL,
  "lessons" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "CrewMentorBond_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrewMentorBond_lessons_check" CHECK ("lessons" >= 0 AND "lessons" <= 5),
  CONSTRAINT "CrewMentorBond_distinct_check" CHECK ("mentorId" <> "apprenticeId")
);
CREATE UNIQUE INDEX "CrewMentorBond_apprenticeId_key" ON "CrewMentorBond"("apprenticeId");
CREATE INDEX "CrewMentorBond_roundPlayerId_endedAt_idx" ON "CrewMentorBond"("roundPlayerId", "endedAt");
CREATE INDEX "CrewMentorBond_roundPlayerId_mentorId_endedAt_idx" ON "CrewMentorBond"("roundPlayerId", "mentorId", "endedAt");
ALTER TABLE "CrewMentorBond" ADD CONSTRAINT "CrewMentorBond_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewMentorBond" ADD CONSTRAINT "CrewMentorBond_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "CrewMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewMentorBond" ADD CONSTRAINT "CrewMentorBond_apprenticeId_fkey" FOREIGN KEY ("apprenticeId") REFERENCES "CrewMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CrewBondMemory" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "bondId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrewBondMemory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrewBondMemory_bondId_sourceKey_key" ON "CrewBondMemory"("bondId", "sourceKey");
CREATE INDEX "CrewBondMemory_bondId_at_idx" ON "CrewBondMemory"("bondId", "at" DESC);
ALTER TABLE "CrewBondMemory" ADD CONSTRAINT "CrewBondMemory_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewBondMemory" ADD CONSTRAINT "CrewBondMemory_bondId_fkey" FOREIGN KEY ("bondId") REFERENCES "CrewMentorBond"("id") ON DELETE CASCADE ON UPDATE CASCADE;
