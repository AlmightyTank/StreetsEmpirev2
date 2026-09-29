-- Trips B. The boss rides along with a run; the hotel bills the run's cash by the hour.
-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "bossAboard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hotelCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "hotelHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hotelStayAt" TIMESTAMP(3);

ALTER TABLE "Run" ADD CONSTRAINT "Run_hotel_nonnegative" CHECK ("hotelCents" >= 0 AND "hotelHours" >= 0);

-- One boss: at most one active run carries them.
CREATE UNIQUE INDEX "Run_one_boss_aboard_per_player" ON "Run"("roundPlayerId") WHERE "status" = 'ACTIVE' AND "bossAboard";
