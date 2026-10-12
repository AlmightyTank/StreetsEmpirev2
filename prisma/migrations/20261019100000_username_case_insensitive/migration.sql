-- A pimp name is one player whatever its capitals: AMightyTank and amightytank can never be
-- two accounts. Account_usernameNormalized_key already makes the key unique; this makes the
-- database refuse any row whose key is not exactly lower(username), so no code path, script
-- or hand edit can store a second casing of a taken name.

-- 1. Before the rule goes on, any account whose key drifted and whose lowercase name is
--    already held (by another account, or by an older drifted one) keeps playing under a
--    unique name, and its round names follow it.
WITH drifted AS (
  SELECT a."id", a."username",
    EXISTS (
      SELECT 1 FROM "Account" o
      WHERE o."id" <> a."id" AND o."usernameNormalized" = lower(a."username")
    ) AS "taken",
    row_number() OVER (PARTITION BY lower(a."username") ORDER BY a."createdAt", a."id") AS "rank"
  FROM "Account" a
  WHERE a."usernameNormalized" <> lower(a."username")
),
renamed AS (
  UPDATE "Account" a
  SET "username" = left(d."username", 12) || '_' || right(a."id", 7),
      "usernameNormalized" = lower(left(d."username", 12) || '_' || right(a."id", 7))
  FROM drifted d
  WHERE a."id" = d."id" AND (d."taken" OR d."rank" > 1)
  RETURNING a."id", a."username", d."username" AS "previous"
)
UPDATE "RoundPlayer" rp
SET "displayName" = r."username"
FROM renamed r
WHERE rp."accountId" = r."id" AND rp."displayName" = r."previous";

-- 2. Every other drifted key is simply corrected.
UPDATE "Account" SET "usernameNormalized" = lower("username") WHERE "usernameNormalized" <> lower("username");

-- 3. From now on the key is always the lowercase name, so the unique index covers every casing.
ALTER TABLE "Account" ADD CONSTRAINT "Account_usernameNormalized_lowercase" CHECK ("usernameNormalized" = lower("username"));
