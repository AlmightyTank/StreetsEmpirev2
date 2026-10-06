-- StreetsEmpire 1.4.0-F: reaching Inner Circle is posted to the public street feed, once.

-- AlterTable
ALTER TABLE "PlayerFactionStanding" ADD COLUMN "innerCircleAt" TIMESTAMP(3),
ADD COLUMN "innerCirclePostedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlayerFactionStanding_innerCirclePostedAt_innerCircleAt_idx" ON "PlayerFactionStanding"("innerCirclePostedAt", "innerCircleAt");
