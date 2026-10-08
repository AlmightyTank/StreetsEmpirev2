-- 1.5.0-E3. San Francisco joins the city catalog. Beverly Hills stays: older pinned rounds
-- still have it, and each round's ruleset decides which cities its map shows.
INSERT INTO "City" ("id", "slug", "name", "sortOrder", "isEnabled", "createdAt", "updatedAt")
VALUES ('travel-city-san-francisco', 'san-francisco', 'San Francisco', 9, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name", "isEnabled" = true, "updatedAt" = CURRENT_TIMESTAMP;
