-- Rounds closed early used to keep their scheduled end date, so the hall of fame
-- showed seasons ending weeks after they had. Pull each finished round back to
-- the moment its standings froze: every player is stamped with it at close.
-- Rounds with no players fall back to their last update. Nothing moves later.
UPDATE "Round" AS r SET "endsAt" = GREATEST(r."startsAt", closed.at)
FROM (
  SELECT f."id", COALESCE(
    (SELECT MAX(rp."dailyRankSnapshotAt") FROM "RoundPlayer" rp WHERE rp."roundId" = f."id"),
    f."updatedAt"
  ) AS at
  FROM "Round" f
  WHERE f."status" IN ('ENDED', 'ARCHIVED')
) AS closed
WHERE r."id" = closed."id" AND closed.at < r."endsAt";
