-- StreetsEmpire 1.2.0-F: casino season-feat stats on rated play.

ALTER TABLE "CasinoRating" ADD COLUMN "vipWagers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CasinoRating" ADD COLUMN "jackpots" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CasinoRating" ADD COLUMN "biggestWinCents" BIGINT NOT NULL DEFAULT 0;
