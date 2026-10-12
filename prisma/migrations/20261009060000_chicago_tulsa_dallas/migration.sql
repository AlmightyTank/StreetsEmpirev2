-- 1.6.0-G. Chicago, Tulsa and Dallas join the city catalog. Older pinned rounds never list
-- them: each round's ruleset decides which cities its map shows.
INSERT INTO "City" ("id", "slug", "name", "sortOrder", "isEnabled", "createdAt", "updatedAt")
VALUES
  ('travel-city-chicago', 'chicago', 'Chicago', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('travel-city-tulsa', 'tulsa', 'Tulsa', 11, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('travel-city-dallas', 'dallas', 'Dallas', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name", "isEnabled" = true, "updatedAt" = CURRENT_TIMESTAMP;
