ALTER TABLE "Account"
  ADD COLUMN "googleId" TEXT,
  ADD COLUMN "googleEmail" TEXT,
  ADD COLUMN "googleLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Account_googleId_key" ON "Account"("googleId");
