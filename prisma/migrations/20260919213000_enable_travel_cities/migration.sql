-- 0.5.0 travel catalog repair.
--
-- Production deploys run Prisma migrations but do not run the development seed.
-- Older databases can therefore contain only New York even though the 0.5.0
-- ruleset defines all eight travel cities. Upsert the complete travel catalog
-- and enable every city so fresh accounts receive the full road map.
INSERT INTO "City" (
    "id",
    "slug",
    "name",
    "sortOrder",
    "isEnabled",
    "createdAt",
    "updatedAt"
)
VALUES
    ('travel-city-new-york-city', 'new-york-city', 'New York City', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('travel-city-detroit', 'detroit', 'Detroit', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('travel-city-miami-beach', 'miami-beach', 'Miami Beach', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('travel-city-seattle', 'seattle', 'Seattle', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('travel-city-beverly-hills', 'beverly-hills', 'Beverly Hills', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('travel-city-las-vegas', 'las-vegas', 'Las Vegas', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('travel-city-los-angeles', 'los-angeles', 'Los Angeles', 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('travel-city-atlanta', 'atlanta', 'Atlanta', 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE
SET
    "name" = EXCLUDED."name",
    "sortOrder" = EXCLUDED."sortOrder",
    "isEnabled" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
