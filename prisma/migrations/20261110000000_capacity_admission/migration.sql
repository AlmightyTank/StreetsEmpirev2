CREATE TABLE "AdmissionTicket" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "admittedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    CONSTRAINT "AdmissionTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdmissionLease" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdmissionLease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdmissionSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "roundId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "supporterPriority" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "rotationSequence" INTEGER NOT NULL DEFAULT 0,
    "renewalFailures" INTEGER NOT NULL DEFAULT 0,
    "lastRenewalFailureAt" TIMESTAMP(3),
    "lastPromotionAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdmissionSettings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdmissionTicket_lane_enqueuedAt_idx" ON "AdmissionTicket"("lane", "enqueuedAt");
CREATE INDEX "AdmissionTicket_canceledAt_enqueuedAt_idx" ON "AdmissionTicket"("canceledAt", "enqueuedAt");
CREATE UNIQUE INDEX "AdmissionTicket_accountId_roundId_key" ON "AdmissionTicket"("accountId", "roundId");
CREATE INDEX "AdmissionTicket_roundId_lane_enqueuedAt_idx" ON "AdmissionTicket"("roundId", "lane", "enqueuedAt");
CREATE INDEX "AdmissionLease_expiresAt_idx" ON "AdmissionLease"("expiresAt");
CREATE UNIQUE INDEX "AdmissionLease_accountId_roundId_key" ON "AdmissionLease"("accountId", "roundId");
CREATE INDEX "AdmissionLease_roundId_expiresAt_idx" ON "AdmissionLease"("roundId", "expiresAt");
CREATE UNIQUE INDEX "AdmissionSettings_roundId_key" ON "AdmissionSettings"("roundId");
ALTER TABLE "AdmissionTicket" ADD CONSTRAINT "AdmissionTicket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionTicket" ADD CONSTRAINT "AdmissionTicket_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionLease" ADD CONSTRAINT "AdmissionLease_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionLease" ADD CONSTRAINT "AdmissionLease_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionSettings" ADD CONSTRAINT "AdmissionSettings_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
