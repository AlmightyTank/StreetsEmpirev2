-- StreetsEmpire 1.2.0-B: persistent progressive jackpot pools for server-authoritative Slots.

CREATE TABLE "CasinoJackpot" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "machineKey" TEXT NOT NULL,
  "poolCents" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasinoJackpot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasinoJackpot_roundId_machineKey_key" ON "CasinoJackpot"("roundId", "machineKey");
CREATE INDEX "CasinoJackpot_machineKey_idx" ON "CasinoJackpot"("machineKey");

ALTER TABLE "CasinoJackpot"
  ADD CONSTRAINT "CasinoJackpot_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
