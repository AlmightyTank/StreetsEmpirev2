-- Crew names are public search identifiers. Keep them unique without making
-- display casing significant, while preserving existing profiles by adding a
-- short numeric disambiguator to duplicate legacy names.
DO $$
DECLARE
  duplicate_row RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR duplicate_row IN
    WITH ranked AS (
      SELECT
        "accountId",
        "crewName",
        row_number() OVER (PARTITION BY lower(trim("crewName")) ORDER BY "accountId") AS duplicate_number
      FROM "AccountProfile"
      WHERE "crewName" IS NOT NULL AND trim("crewName") <> ''
    )
    SELECT "accountId", "crewName", duplicate_number
    FROM ranked
    WHERE duplicate_number > 1
  LOOP
    suffix := duplicate_row.duplicate_number;
    LOOP
      candidate := left(trim(duplicate_row."crewName"), 32 - length(' #' || suffix::TEXT))
        || ' #' || suffix::TEXT;
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "AccountProfile"
        WHERE lower(trim("crewName")) = lower(candidate)
          AND "accountId" <> duplicate_row."accountId"
      );
      suffix := suffix + 1;
    END LOOP;

    UPDATE "AccountProfile"
    SET "crewName" = candidate
    WHERE "accountId" = duplicate_row."accountId";
  END LOOP;
END $$;

CREATE UNIQUE INDEX "AccountProfile_crewName_lower_key"
  ON "AccountProfile" (lower(trim("crewName")))
  WHERE "crewName" IS NOT NULL AND trim("crewName") <> '';
