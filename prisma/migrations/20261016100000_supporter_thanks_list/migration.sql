-- Supporter thank-you list: players opt in from Account → Supporting.
ALTER TABLE "AccountProfile" ADD COLUMN "showOnSupporterList" BOOLEAN NOT NULL DEFAULT false;
