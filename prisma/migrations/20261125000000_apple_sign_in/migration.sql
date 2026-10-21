ALTER TABLE "Account"
  ADD COLUMN "appleId" TEXT,
  ADD COLUMN "appleEmail" TEXT,
  ADD COLUMN "appleLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Account_appleId_key" ON "Account"("appleId");
