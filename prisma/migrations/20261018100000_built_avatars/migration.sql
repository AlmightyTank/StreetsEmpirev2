-- Avatars built from face pieces, for players who would rather not use a picture.
ALTER TABLE "AccountProfile"
ADD COLUMN "profileAvatar" JSONB;
