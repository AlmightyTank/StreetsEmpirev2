-- 0.5.0-E. Escorts ride armed with guns out of home stock, and a crew recons its area to
-- find runs coming near or leaving.
-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "ak47s" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pistols" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shotguns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tek9s" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ConvoyRecon" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "targets" JSONB NOT NULL,

    CONSTRAINT "ConvoyRecon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConvoyRecon_roundPlayerId_key" ON "ConvoyRecon"("roundPlayerId");

-- AddForeignKey
ALTER TABLE "ConvoyRecon" ADD CONSTRAINT "ConvoyRecon_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A run carries whole guns, never fewer than none.
ALTER TABLE "Run" ADD CONSTRAINT "Run_guns_check" CHECK ("pistols" >= 0 AND "shotguns" >= 0 AND "tek9s" >= 0 AND "ak47s" >= 0);
ALTER TABLE "ConvoyRecon" ADD CONSTRAINT "ConvoyRecon_fresh_check" CHECK ("expiresAt" >= "seenAt");
