CREATE TABLE "AccountProfile" (
    "accountId" TEXT NOT NULL,
    "activeTitleKey" TEXT,
    "featuredBadgeKeys" JSONB NOT NULL DEFAULT '[]',
    "profileAccent" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountProfile_pkey" PRIMARY KEY ("accountId")
);

ALTER TABLE "AccountProfile"
  ADD CONSTRAINT "AccountProfile_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
