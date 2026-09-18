-- 0.5.0-A. A city's character is balance, and balance lives in the pinned ruleset.
-- The modifiers were 1.0 on every row; rounds before 0.5.0-A read 1.0 from the engine.
ALTER TABLE "City" DROP COLUMN "scoutModifier",
DROP COLUMN "incomeModifier",
DROP COLUMN "crackModifier";
