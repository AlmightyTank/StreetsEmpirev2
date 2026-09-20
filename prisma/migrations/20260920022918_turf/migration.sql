-- AlterTable
ALTER TABLE "RoundPlayer" ADD COLUMN     "postedThugs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Turf" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "holderId" TEXT,
    "cornerThugs" INTEGER NOT NULL DEFAULT 0,
    "heldSince" TIMESTAMP(3),
    "shieldUntil" TIMESTAMP(3),
    "localsThugs" INTEGER NOT NULL,
    "localsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurfPresence" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "turns" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurfPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Turf_roundId_holderId_idx" ON "Turf"("roundId", "holderId");

-- CreateIndex
CREATE UNIQUE INDEX "Turf_roundId_cityId_district_key" ON "Turf"("roundId", "cityId", "district");

-- CreateIndex
CREATE UNIQUE INDEX "TurfPresence_roundPlayerId_cityId_district_key" ON "TurfPresence"("roundPlayerId", "cityId", "district");

-- AddForeignKey
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "RoundPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurfPresence" ADD CONSTRAINT "TurfPresence_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurfPresence" ADD CONSTRAINT "TurfPresence_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nothing on a corner or a block goes negative, and a held block always has somebody on it.
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_postedThugs_check" CHECK ("postedThugs" >= 0);
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_corner_check" CHECK ("cornerThugs" >= 0 AND "localsThugs" >= 0);
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_holder_check" CHECK (("holderId" IS NULL AND "cornerThugs" = 0) OR ("holderId" IS NOT NULL AND "cornerThugs" > 0));
ALTER TABLE "TurfPresence" ADD CONSTRAINT "TurfPresence_turns_check" CHECK ("turns" >= 0);
