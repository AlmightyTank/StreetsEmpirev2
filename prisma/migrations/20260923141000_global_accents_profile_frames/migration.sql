-- Phase Y-D: global accents and account-selected profile frames.
ALTER TABLE "AccountProfile"
ADD COLUMN "activeProfileFrameKey" TEXT;

ALTER TABLE "AccountCosmeticUnlock"
ADD COLUMN "styleKey" TEXT;
