-- Round Roll Call Slice A: at most one server-authoritative attendance stamp
-- per round-player and round-relative day; a new RoundPlayer starts a new track.
CREATE TABLE "RoundLoginCheckIn" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoundLoginCheckIn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoundLoginCheckIn_dayIndex_positive" CHECK ("dayIndex" >= 1)
);

CREATE UNIQUE INDEX "RoundLoginCheckIn_roundPlayerId_dayIndex_key"
ON "RoundLoginCheckIn"("roundPlayerId", "dayIndex");

CREATE INDEX "RoundLoginCheckIn_roundPlayerId_checkedInAt_idx"
ON "RoundLoginCheckIn"("roundPlayerId", "checkedInAt");

ALTER TABLE "RoundLoginCheckIn"
ADD CONSTRAINT "RoundLoginCheckIn_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
