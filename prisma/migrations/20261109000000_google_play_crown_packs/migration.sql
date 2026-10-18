CREATE TABLE "GooglePlayCrownPackOrder" (
    "purchaseToken" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
    "productId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "crowns" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "orderId" TEXT,
    "currency" TEXT,
    "amountCents" INTEGER,
    "purchasedAt" DATETIME,
    "creditedAt" DATETIME,
    "refundedAt" DATETIME,
    "lastVerifiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GooglePlayCrownPackOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "GooglePlayCrownPackOrder_accountId_createdAt_idx" ON "GooglePlayCrownPackOrder"("accountId", "createdAt");
CREATE INDEX "GooglePlayCrownPackOrder_orderId_idx" ON "GooglePlayCrownPackOrder"("orderId");
CREATE INDEX "GooglePlayCrownPackOrder_status_createdAt_idx" ON "GooglePlayCrownPackOrder"("status", "createdAt");
