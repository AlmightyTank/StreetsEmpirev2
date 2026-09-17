-- CreateTable
CREATE TABLE "WorkSupplyPolicy" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "primary" TEXT NOT NULL,
    "fallback" TEXT,
    "emergency" TEXT,
    "strict" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSupplyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkSupplyPolicy_roundPlayerId_job_key" ON "WorkSupplyPolicy"("roundPlayerId", "job");

-- AddForeignKey
ALTER TABLE "WorkSupplyPolicy" ADD CONSTRAINT "WorkSupplyPolicy_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
