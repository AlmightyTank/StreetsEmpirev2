-- 2.1.0-F. Celebration preference is personal, cosmetic, and opt-in.
-- Existing accounts remain opted out. No crew stats, XP or rewards change.
ALTER TABLE "AccountProfile" ADD COLUMN "showCrewCelebrations" BOOLEAN NOT NULL DEFAULT false;
