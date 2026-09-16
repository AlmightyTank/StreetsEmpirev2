-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "beerBought" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "condomsBought" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "medicineBought" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pistolsBought" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "raidsDone" INTEGER NOT NULL DEFAULT 0;

-- Raids already on record count. Purchases were never itemised per player, so they start at zero.
UPDATE "RoundPlayer" AS rp SET "raidsDone" = counted.raids
FROM (
  SELECT "attackerId", COUNT(*)::int AS raids FROM "RaidBattle"
  WHERE "kind" = 'RAID' AND "voidedAt" IS NULL
  GROUP BY "attackerId"
) AS counted
WHERE rp."id" = counted."attackerId";
