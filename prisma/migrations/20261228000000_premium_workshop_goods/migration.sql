-- Premium condoms and House Brew are their own stash items, so they can cover more uses than the plain ones.
ALTER TABLE "RoundPlayer" ADD COLUMN "premiumCondoms" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RoundPlayer" ADD COLUMN "houseBrew" INTEGER NOT NULL DEFAULT 0;
