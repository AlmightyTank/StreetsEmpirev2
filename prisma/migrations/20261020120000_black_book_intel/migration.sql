CREATE TABLE "IntelRumor" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "targetId" TEXT,
    "cityId" TEXT NOT NULL,
    "district" TEXT,
    "topic" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'rumor',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "detail" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntelRumor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntelRumor_ownerId_topic_key" ON "IntelRumor"("ownerId", "topic");
CREATE INDEX "IntelRumor_ownerId_expiresAt_idx" ON "IntelRumor"("ownerId", "expiresAt");
CREATE INDEX "IntelRumor_roundId_cityId_confidence_idx" ON "IntelRumor"("roundId", "cityId", "confidence");
CREATE INDEX "IntelRumor_targetId_idx" ON "IntelRumor"("targetId");

ALTER TABLE "IntelRumor" ADD CONSTRAINT "IntelRumor_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntelRumor" ADD CONSTRAINT "IntelRumor_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntelRumor" ADD CONSTRAINT "IntelRumor_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntelRumor" ADD CONSTRAINT "IntelRumor_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
