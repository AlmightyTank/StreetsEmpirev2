-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "registeredIp" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'PASSWORD';

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "username" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "pagePath" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUsername" TEXT,
    "resolution" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_resolvedAt_createdAt_idx" ON "BugReport"("resolvedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BugReport_accountId_createdAt_idx" ON "BugReport"("accountId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Account_registeredIp_createdAt_idx" ON "Account"("registeredIp", "createdAt");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

