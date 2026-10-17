-- 2.1.0-E. Catalog-only nicknames; detachable, moderated account keepsakes.
ALTER TABLE "CrewMember" ADD COLUMN "nicknameKey" TEXT;
ALTER TABLE "CrewMember" ADD COLUMN "nicknameSuppressed" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "CrewLegendArchive" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "sourceRoundId" TEXT NOT NULL,
  "roundName" TEXT NOT NULL,
  "sourceMemberId" TEXT NOT NULL,
  "role" "CrewMemberRole" NOT NULL,
  "serial" INTEGER NOT NULL,
  "memberName" TEXT NOT NULL,
  "nicknameKey" TEXT NOT NULL,
  "nicknameLabel" TEXT NOT NULL,
  "proof" TEXT NOT NULL,
  "trait" TEXT NOT NULL,
  "loyaltyPoints" INTEGER NOT NULL,
  "experiencePoints" INTEGER NOT NULL,
  "finalStatus" "CrewMemberStatus" NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL,
  "artworkKey" TEXT NOT NULL,
  "suppressedAt" TIMESTAMP(3),
  "suppressReason" TEXT,
  CONSTRAINT "CrewLegendArchive_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrewLegendArchive_loyalty_check" CHECK ("loyaltyPoints" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "CrewLegendArchive_accountId_sourceRoundId_sourceMemberId_key" ON "CrewLegendArchive"("accountId","sourceRoundId","sourceMemberId");
CREATE INDEX "CrewLegendArchive_accountId_archivedAt_idx" ON "CrewLegendArchive"("accountId","archivedAt" DESC);
ALTER TABLE "CrewLegendArchive" ADD CONSTRAINT "CrewLegendArchive_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
