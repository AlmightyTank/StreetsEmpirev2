-- Add account-owned interface preferences. These do not affect competitive state.
ALTER TABLE "AccountProfile" ADD COLUMN "uiDensity" TEXT NOT NULL DEFAULT 'comfortable';
ALTER TABLE "AccountProfile" ADD COLUMN "reducedMotion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountProfile" ADD COLUMN "moneyFormat" TEXT NOT NULL DEFAULT 'full';
ALTER TABLE "AccountProfile" ADD COLUMN "defaultLanding" TEXT NOT NULL DEFAULT 'game';
