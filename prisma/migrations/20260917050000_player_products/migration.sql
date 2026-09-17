-- CreateTable
CREATE TABLE "PlayerProduct" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProduct_roundPlayerId_productKey_key" ON "PlayerProduct"("roundPlayerId", "productKey");

-- AddForeignKey
ALTER TABLE "PlayerProduct" ADD CONSTRAINT "PlayerProduct_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
