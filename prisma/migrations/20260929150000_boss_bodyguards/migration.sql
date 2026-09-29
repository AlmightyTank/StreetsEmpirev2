-- Trips D. Bodyguards fly with the boss and can rent guns in town; a hit on the boss is a fight.
-- AlterTable
ALTER TABLE "BossTrip" ADD COLUMN     "bodyguards" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gunRentCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "rentedGuns" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "woundedBodyguards" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BossTrip" ADD CONSTRAINT "BossTrip_bodyguards_valid" CHECK ("bodyguards" >= 0 AND "woundedBodyguards" >= 0 AND "woundedBodyguards" <= "bodyguards" AND "gunRentCents" >= 0);

-- AlterTable
ALTER TABLE "BossHit" ADD COLUMN     "attackerCrew" JSONB;
