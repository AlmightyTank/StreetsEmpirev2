-- Section 34. The pistol gets a shelf, sized not to bite.
--
-- The columns already existed; only the ruleset changes. This backfills
-- existing players onto a full shelf rather than the zero default, matching
-- classic-og-v0.1's cap.

UPDATE "RoundPlayer" SET "pistolStock" = 50;
