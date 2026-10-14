-- Players may change their own pimp name: the first change is free, then once three new
-- rounds have started or three months have passed. Every change is kept for staff.
ALTER TABLE "Account" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);

CREATE TABLE "AccountUsernameChange" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fromUsername" TEXT NOT NULL,
    "toUsername" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountUsernameChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountUsernameChange_accountId_createdAt_idx" ON "AccountUsernameChange"("accountId", "createdAt");

ALTER TABLE "AccountUsernameChange" ADD CONSTRAINT "AccountUsernameChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
