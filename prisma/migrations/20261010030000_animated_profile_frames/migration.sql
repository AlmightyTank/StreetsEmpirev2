-- Split the existing profile frame into independently equipped avatar and popup frames.
ALTER TABLE "AccountProfile"
ADD COLUMN "activeAvatarFrameKey" TEXT;

-- Preserve the look players already selected before they customize the two slots separately.
UPDATE "AccountProfile"
SET "activeAvatarFrameKey" = "activeProfileFrameKey"
WHERE "activeProfileFrameKey" IS NOT NULL;

-- Replace the retired generic effects with their closest StreetsEmpire animation.
UPDATE "AccountProfile" SET "profileEffect" = 'street-circuit' WHERE "profileEffect" = 'neon-pulse';
UPDATE "AccountProfile" SET "profileEffect" = 'night-drive' WHERE "profileEffect" = 'scanlines';
UPDATE "AccountProfile" SET "profileEffect" = 'corner-glow' WHERE "profileEffect" = 'spotlight';
UPDATE "AccountProfile" SET "profileEffect" = 'heat-signal' WHERE "profileEffect" = 'glitch';
UPDATE "AccountProfile" SET "profileEffect" = 'turf-claim' WHERE "profileEffect" = 'ember-sparks';
UPDATE "AccountProfile" SET "profileEffect" = 'high-roller' WHERE "profileEffect" = 'cash-shimmer';
UPDATE "AccountProfile" SET "profileEffect" = 'heat-signal' WHERE "profileEffect" = 'sirens';
UPDATE "AccountProfile" SET "profileEffect" = 'corner-glow' WHERE "profileEffect" = 'smoke';
