-- CreateTable
CREATE TABLE "ProductShelf" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "stockAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShelf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductShelf_roundPlayerId_productKey_key" ON "ProductShelf"("roundPlayerId", "productKey");

-- AddForeignKey
ALTER TABLE "ProductShelf" ADD CONSTRAINT "ProductShelf_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
