-- Account-level item and crew cosmetic loadouts. Presentation only.
ALTER TABLE "AccountProfile"
  ADD COLUMN "itemCosmetics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "crewCosmetics" JSONB NOT NULL DEFAULT '{}'::jsonb;
