-- 1.8.0-C: paced result checks, a poll lease and per-league feed health for admins.
ALTER TABLE "SportsbookEvent"
  ADD COLUMN "resultCheckCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resultCheckedAt" TIMESTAMP(3),
  ADD COLUMN "nextResultCheckAt" TIMESTAMP(3),
  ADD COLUMN "resultError" TEXT NOT NULL DEFAULT '';

ALTER TABLE "SportsbookProviderState"
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastResultCheckAt" TIMESTAMP(3),
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pollLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "leagueStatus" JSONB NOT NULL DEFAULT '{}';
