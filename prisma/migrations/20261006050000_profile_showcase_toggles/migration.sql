-- Slice E: let players choose whether visitors see their site theme and their
-- item/crew look on their public profile. Both default on. Presentation only.
ALTER TABLE "AccountProfile"
  ADD COLUMN "showThemeOnProfile" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showLookOnProfile" BOOLEAN NOT NULL DEFAULT true;
