-- Slice E keeps the provider/league evidence needed for the 30-day expansion decision.
ALTER TABLE "SportsbookFeedRun"
  ADD COLUMN "matcherMisses" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leagueActivity" JSONB NOT NULL DEFAULT '{}';
