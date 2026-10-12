-- Supporter billing through Stripe: membership status, paid invoices and handled webhook events.
CREATE TABLE "SupporterMembership" (
    "accountId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "stripeEventAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupporterMembership_pkey" PRIMARY KEY ("accountId")
);

CREATE TABLE "SupporterPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupporterPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupporterMembership_stripeCustomerId_key" ON "SupporterMembership"("stripeCustomerId");
CREATE UNIQUE INDEX "SupporterMembership_stripeSubscriptionId_key" ON "SupporterMembership"("stripeSubscriptionId");
CREATE INDEX "SupporterMembership_status_idx" ON "SupporterMembership"("status");
CREATE UNIQUE INDEX "SupporterPayment_stripeInvoiceId_key" ON "SupporterPayment"("stripeInvoiceId");
CREATE INDEX "SupporterPayment_accountId_paidAt_idx" ON "SupporterPayment"("accountId", "paidAt");
CREATE INDEX "SupporterPayment_stripeCustomerId_paidAt_idx" ON "SupporterPayment"("stripeCustomerId", "paidAt");

ALTER TABLE "SupporterMembership" ADD CONSTRAINT "SupporterMembership_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupporterPayment" ADD CONSTRAINT "SupporterPayment_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
