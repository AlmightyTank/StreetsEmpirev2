-- 2.0.0-B Criminal Case Files. No backfill, gameplay triggers, or reward grants.
CREATE TYPE "CriminalCaseStatus" AS ENUM ('LOCKED', 'AVAILABLE', 'ACTIVE', 'SOLVED', 'CLOSED', 'EXPIRED');

CREATE TABLE "CriminalCaseFile" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "storyKey" TEXT NOT NULL,
  "caseKey" TEXT NOT NULL,
  "rulesetId" TEXT NOT NULL,
  "rulesetVersion" TEXT NOT NULL,
  "sourceMemoryId" TEXT,
  "offerDedupeKey" TEXT NOT NULL,
  "cluePlan" JSONB NOT NULL DEFAULT '[]',
  "branchKeys" JSONB NOT NULL DEFAULT '[]',
  "status" "CriminalCaseStatus" NOT NULL DEFAULT 'AVAILABLE',
  "expiresAtActive" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "solvedAt" TIMESTAMP(3),
  "chosenBranch" TEXT,
  "chosenAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CriminalCaseFile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CriminalCaseFile_offerDedupeKey_key" ON "CriminalCaseFile"("offerDedupeKey");
CREATE INDEX "CriminalCaseFile_ownerId_roundId_status_createdAt_idx" ON "CriminalCaseFile"("ownerId", "roundId", "status", "createdAt" DESC);
CREATE INDEX "CriminalCaseFile_roundId_cityId_createdAt_idx" ON "CriminalCaseFile"("roundId", "cityId", "createdAt" DESC);
CREATE INDEX "CriminalCaseFile_sourceMemoryId_idx" ON "CriminalCaseFile"("sourceMemoryId");
ALTER TABLE "CriminalCaseFile" ADD CONSTRAINT "CriminalCaseFile_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriminalCaseFile" ADD CONSTRAINT "CriminalCaseFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriminalCaseFile" ADD CONSTRAINT "CriminalCaseFile_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriminalCaseFile" ADD CONSTRAINT "CriminalCaseFile_sourceMemoryId_fkey" FOREIGN KEY ("sourceMemoryId") REFERENCES "CityMemoryEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CriminalCaseEvidence" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "clueKey" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceReceiptId" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CriminalCaseEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CriminalCaseEvidence_caseId_clueKey_key" ON "CriminalCaseEvidence"("caseId", "clueKey");
CREATE UNIQUE INDEX "CriminalCaseEvidence_caseId_sourceKind_key" ON "CriminalCaseEvidence"("caseId", "sourceKind");
CREATE UNIQUE INDEX "CriminalCaseEvidence_caseId_sourceReceiptId_key" ON "CriminalCaseEvidence"("caseId", "sourceReceiptId");
CREATE INDEX "CriminalCaseEvidence_caseId_recordedAt_idx" ON "CriminalCaseEvidence"("caseId", "recordedAt");
ALTER TABLE "CriminalCaseEvidence" ADD CONSTRAINT "CriminalCaseEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CriminalCaseFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
