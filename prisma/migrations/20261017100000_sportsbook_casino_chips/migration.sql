-- Sportsbook wagers now use the same city-scoped casino chips and open floor
-- bankroll as the other casino games. Existing tickets remain nullable so
-- legacy rows without a stored casino origin can still settle safely as chips.
ALTER TABLE "SportsbookBet"
  ADD COLUMN "casinoSessionId" TEXT,
  ADD COLUMN "casinoCityId" TEXT;

CREATE INDEX "SportsbookBet_casinoSessionId_idx" ON "SportsbookBet"("casinoSessionId");
CREATE INDEX "SportsbookBet_casinoCityId_status_idx" ON "SportsbookBet"("casinoCityId", "status");

ALTER TABLE "SportsbookBet"
  ADD CONSTRAINT "SportsbookBet_casinoSessionId_fkey"
  FOREIGN KEY ("casinoSessionId") REFERENCES "CasinoSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SportsbookBet"
  ADD CONSTRAINT "SportsbookBet_casinoCityId_fkey"
  FOREIGN KEY ("casinoCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
