-- 1.8.0-E: how each game was graded, and a 90-day log of feed runs for the market review.
ALTER TABLE "SportsbookEvent" ADD COLUMN "settledVia" TEXT NOT NULL DEFAULT '';

-- Games settled before this migration: the audit log shows which an admin graded (a void, or a
-- recheck that settled it); the feed graded the rest.
UPDATE "SportsbookEvent" e SET "settledVia" = CASE
  WHEN EXISTS (SELECT 1 FROM "AdminAuditLog" a WHERE a."action" = 'sportsbook.void' AND a."targetId" = e."id") THEN 'ADMIN_VOID'
  WHEN EXISTS (SELECT 1 FROM "AdminAuditLog" a WHERE a."action" = 'sportsbook.recheck' AND a."targetId" = e."id"
                AND a."after"->>'outcome' IN ('SETTLED', 'VOIDED')) THEN 'ADMIN_RECHECK'
  ELSE 'FEED'
END
WHERE e."settledAt" IS NOT NULL;

CREATE TABLE "SportsbookFeedRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "oddsPolled" BOOLEAN NOT NULL,
    "requests" INTEGER NOT NULL,
    "datapoints" INTEGER NOT NULL,
    "snapshots" INTEGER NOT NULL,
    "failedSnapshots" INTEGER NOT NULL,
    "pulled" INTEGER NOT NULL,
    "resultChecks" INTEGER NOT NULL,
    "settled" INTEGER NOT NULL,
    "failed" BOOLEAN NOT NULL,
    "error" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "SportsbookFeedRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SportsbookFeedRun_startedAt_idx" ON "SportsbookFeedRun"("startedAt");
