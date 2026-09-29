-- Trips D2. Airport security checks the flight home once, as the boss leaves town.
ALTER TABLE "BossTrip" ADD COLUMN     "airportHomeCheckedAt" TIMESTAMP(3);
