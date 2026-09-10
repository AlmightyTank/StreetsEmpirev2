-- Reputation replaces the weapon unlock ladder.
--
-- The old gate read `streetWorkTurns`, a counter named after Work the Streets
-- - an action that was deleted. It only still ticked because Scout was wired
-- to keep feeding it so the AK-47 stayed reachable. Standing across the four
-- traders replaces it.
--
-- Traders live in rows rather than columns because they are ruleset-defined:
-- a variant with a different set of shops must not need a migration.

CREATE TABLE "PlayerReputation" (
  "id"            TEXT         NOT NULL,
  "roundPlayerId" TEXT         NOT NULL,
  "trader"        TEXT         NOT NULL,
  "points"        INTEGER      NOT NULL DEFAULT 0,
  "creditedOn"    TIMESTAMP(3),
  "questDoneAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlayerReputation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerReputation_roundPlayerId_trader_key"
  ON "PlayerReputation" ("roundPlayerId", "trader");
CREATE INDEX "PlayerReputation_roundPlayerId_idx"
  ON "PlayerReputation" ("roundPlayerId");

ALTER TABLE "PlayerReputation"
  ADD CONSTRAINT "PlayerReputation_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Quest progress that is per-player rather than per-trader.
ALTER TABLE "RoundPlayer"
  ADD COLUMN "shotgunUnlocked"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cleanShiftStreak"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rocksSuppliedToPip" INTEGER NOT NULL DEFAULT 0;

-- Shotguns were open to everyone before this, so nobody loses access they
-- already had. Tek-9 and AK-47 access is left exactly as earned.
UPDATE "RoundPlayer" SET "shotgunUnlocked" = true;

-- Seed a standing row per trader for every existing player.
INSERT INTO "PlayerReputation" ("id", "roundPlayerId", "trader", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id" || t."trader"),
  p."id",
  t."trader",
  CURRENT_TIMESTAMP
FROM "RoundPlayer" p
CROSS JOIN (VALUES ('CORNER'), ('TOMMY'), ('CHARLIE'), ('PIP')) AS t("trader");

ALTER TABLE "RoundPlayer" DROP COLUMN "streetWorkTurns";
