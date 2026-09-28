-- 0.9.0-F: public crew names and peak crew size for seasonal profile statistics.

ALTER TABLE "AccountProfile" ADD COLUMN "crewName" TEXT;

ALTER TABLE "RoundPlayer" ADD COLUMN "peakCrew" INTEGER NOT NULL DEFAULT 0;

-- Rows from before this migration only know the crew they have now.
UPDATE "RoundPlayer" SET "peakCrew" = "whores" + "thugs";
