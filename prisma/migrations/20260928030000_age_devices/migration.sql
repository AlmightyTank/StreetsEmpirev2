-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "ageConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountDevice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDevice_accountId_deviceHash_key" ON "AccountDevice"("accountId", "deviceHash");

-- AddForeignKey
ALTER TABLE "AccountDevice" ADD CONSTRAINT "AccountDevice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

