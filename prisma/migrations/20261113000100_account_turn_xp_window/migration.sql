-- Turn XP taper: turns spent in the current daily window, per account.
ALTER TABLE "Account" ADD COLUMN "turnXpWindowStartsAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "turnXpTurnsInWindow" INTEGER NOT NULL DEFAULT 0;
