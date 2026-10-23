-- Living Streets 2.0.0-C. Active-clock offer times and event provenance.
-- No backfill: historical CityMemoryEvent rows never automatically yield stories.
ALTER TABLE "CriminalCaseFile" ADD COLUMN "offeredAtActive" TIMESTAMP(3);
CREATE INDEX "CriminalCaseFile_ownerId_offeredAtActive_idx" ON "CriminalCaseFile"("ownerId","offeredAtActive");
CREATE INDEX "CriminalCaseFile_roundId_cityId_offeredAtActive_idx" ON "CriminalCaseFile"("roundId","cityId","offeredAtActive");
ALTER TABLE "CityMemoryEvent" ADD COLUMN "happenedAtActive" TIMESTAMP(3);
