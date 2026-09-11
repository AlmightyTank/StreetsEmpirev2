ALTER TABLE "RoundPlayer"
ADD COLUMN "localRankSinceAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "nationalRankSinceAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RoundPlayer"
SET "localRankSinceAt" = COALESCE("dailyRankSnapshotAt", "createdAt"),
    "nationalRankSinceAt" = COALESCE("dailyRankSnapshotAt", "createdAt");
