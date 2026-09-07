ALTER TABLE "RoundPlayer"
  ADD COLUMN "streetWorkTurns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tek9Unlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ak47Unlocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "ActivityType" ADD VALUE 'WEAPON_UNLOCK';

-- Credit existing work, once, without relying on the feed being kept forever.
UPDATE "RoundPlayer" AS player
SET "streetWorkTurns" = history.turns
FROM (
  SELECT "roundPlayerId",
    LEAST(2147483647, SUM((payload->>'turns')::numeric))::integer AS turns
  FROM "PlayerActivity"
  WHERE type = 'WORK_STREETS' AND (payload->>'turns') ~ '^[0-9]+$'
  GROUP BY "roundPlayerId"
) AS history
WHERE player.id = history."roundPlayerId";
