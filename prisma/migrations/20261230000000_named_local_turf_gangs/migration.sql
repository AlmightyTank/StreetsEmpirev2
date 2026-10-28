ALTER TABLE "Turf" ADD COLUMN "localGangId" TEXT;

CREATE INDEX "Turf_roundId_localGangId_idx" ON "Turf"("roundId", "localGangId");

ALTER TABLE "Turf"
ADD CONSTRAINT "Turf_localGangId_fkey"
FOREIGN KEY ("localGangId") REFERENCES "EncounterGang"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
