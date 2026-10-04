ALTER TABLE "AccountProfile" ADD COLUMN "profileBio" TEXT;
ALTER TABLE "AccountProfile" ADD COLUMN "profileImageUrl" TEXT;
ALTER TABLE "AccountProfile" ADD COLUMN "profileBannerUrl" TEXT;
ALTER TABLE "AccountProfile" ADD COLUMN "profileEffect" TEXT NOT NULL DEFAULT 'none';
