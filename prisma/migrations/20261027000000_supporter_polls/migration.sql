-- Supporter-only monthly drop theme polls. Additive and cosmetic-only.
CREATE TABLE "supporter_poll" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "options" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "opensAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closesAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supporter_poll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supporter_vote" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "optionKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supporter_vote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supporter_poll_status_opensAt_idx" ON "supporter_poll"("status", "opensAt");
CREATE UNIQUE INDEX "supporter_vote_pollId_accountId_key" ON "supporter_vote"("pollId", "accountId");
CREATE INDEX "supporter_vote_accountId_createdAt_idx" ON "supporter_vote"("accountId", "createdAt");

ALTER TABLE "supporter_vote" ADD CONSTRAINT "supporter_vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "supporter_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supporter_vote" ADD CONSTRAINT "supporter_vote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
