-- 2.1.0-C. Account-private, off by default, no effect on game balance.
ALTER TABLE "AccountProfile" ADD COLUMN "showCrewMoments" BOOLEAN NOT NULL DEFAULT false;
