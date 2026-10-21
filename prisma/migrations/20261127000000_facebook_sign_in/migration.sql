ALTER TABLE "Account"
  ADD COLUMN "facebookId" TEXT,
  ADD COLUMN "facebookEmail" TEXT,
  ADD COLUMN "facebookLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Account_facebookId_key" ON "Account"("facebookId");
