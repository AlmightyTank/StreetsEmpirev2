-- Remove wear/fatigue.
--
-- It was never part of the 0.1.0 spec: sections 19-21 define happiness purely
-- as the payout, the shelves and protection, and section 20 calls the thug
-- formula frozen. Fatigue was an accumulating stat added on top, and it grew
-- to dominate everything the spec actually specifies - a maximum penalty of
-- 100 against 80 for every specified term combined.
--
-- Happiness is once again a pure reading of the player's current state, so
-- there is nothing to persist and nothing to wait out.

-- AlterTable
ALTER TABLE "RoundPlayer" DROP COLUMN "thugFatigue",
DROP COLUMN "whoreFatigue";
