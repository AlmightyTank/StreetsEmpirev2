ALTER TABLE "SupporterPayment"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN "providerPaymentId" TEXT;

UPDATE "SupporterPayment"
SET "providerPaymentId" = "stripeInvoiceId";

ALTER TABLE "SupporterPayment"
  ALTER COLUMN "providerPaymentId" SET NOT NULL,
  ALTER COLUMN "stripeInvoiceId" DROP NOT NULL,
  ALTER COLUMN "stripeCustomerId" DROP NOT NULL;

CREATE UNIQUE INDEX "SupporterPayment_providerPaymentId_key"
  ON "SupporterPayment"("providerPaymentId");
CREATE INDEX "SupporterPayment_provider_paidAt_idx"
  ON "SupporterPayment"("provider", "paidAt");

CREATE TABLE "google_play_supporter_subscription" (
  "purchaseToken" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3),
  "autoRenewing" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "latestOrderId" TEXT,
  "linkedPurchaseToken" TEXT,
  "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_play_supporter_subscription_pkey" PRIMARY KEY ("purchaseToken")
);

CREATE INDEX "google_play_supporter_subscription_accountId_lastVerifiedAt_idx"
  ON "google_play_supporter_subscription"("accountId", "lastVerifiedAt");
CREATE INDEX "google_play_supporter_subscription_status_currentPeriodEnd_idx"
  ON "google_play_supporter_subscription"("status", "currentPeriodEnd");
ALTER TABLE "google_play_supporter_subscription"
  ADD CONSTRAINT "google_play_supporter_subscription_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
