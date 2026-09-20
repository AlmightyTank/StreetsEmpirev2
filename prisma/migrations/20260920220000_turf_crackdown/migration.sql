-- 0.6.0-F: one deterministic late-round Federal turf sweep per round.
CREATE TABLE "TurfCrackdown" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "warningAt" TIMESTAMP(3) NOT NULL,
    "sweepAt" TIMESTAMP(3) NOT NULL,
    "sweptAt" TIMESTAMP(3),
    "holdersAffected" INTEGER NOT NULL DEFAULT 0,
    "thugsPickedUp" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB NOT NULL DEFAULT '[]',
    "warningDiscordPostedAt" TIMESTAMP(3),
    "sweepDiscordPostedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurfCrackdown_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TurfCrackdown_roundId_key" ON "TurfCrackdown"("roundId");
CREATE INDEX "TurfCrackdown_warningAt_idx" ON "TurfCrackdown"("warningAt");
CREATE INDEX "TurfCrackdown_sweepAt_sweptAt_idx" ON "TurfCrackdown"("sweepAt", "sweptAt");
CREATE INDEX "TurfCrackdown_warningDiscordPostedAt_warningAt_idx" ON "TurfCrackdown"("warningDiscordPostedAt", "warningAt");
CREATE INDEX "TurfCrackdown_sweepDiscordPostedAt_sweepAt_idx" ON "TurfCrackdown"("sweepDiscordPostedAt", "sweepAt");

ALTER TABLE "TurfCrackdown"
ADD CONSTRAINT "TurfCrackdown_roundId_fkey"
FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TurfCrackdown"
ADD CONSTRAINT "TurfCrackdown_cityId_fkey"
FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
