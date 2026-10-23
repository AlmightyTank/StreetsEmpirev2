-- 2.2.0. Nullable catalog fields leave existing Corner Takeover rows on the prototype interpreter.
ALTER TABLE "Round" ADD COLUMN "underworldOperationsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Operation" ADD COLUMN "catalogKey" TEXT,
ADD COLUMN "catalogVersion" TEXT,
ADD COLUMN "rulesSnapshot" JSONB,
ADD COLUMN "windows" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "committedCostCents" INTEGER NOT NULL DEFAULT 0;

ALTER TYPE "SupplyMovementKind" ADD VALUE IF NOT EXISTS 'OPERATION_RECOVERY';

CREATE TABLE "OperationTransition" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "actorId" TEXT,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationSourceClaim" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationSourceClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationGrant" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationTransition_operationId_createdAt_idx" ON "OperationTransition"("operationId", "createdAt");
CREATE UNIQUE INDEX "OperationSourceClaim_roundId_sourceKind_sourceId_key" ON "OperationSourceClaim"("roundId", "sourceKind", "sourceId");
CREATE INDEX "OperationSourceClaim_operationId_idx" ON "OperationSourceClaim"("operationId");
CREATE UNIQUE INDEX "OperationGrant_operationId_roundPlayerId_kind_key" ON "OperationGrant"("operationId", "roundPlayerId", "kind");

ALTER TABLE "OperationTransition" ADD CONSTRAINT "OperationTransition_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationSourceClaim" ADD CONSTRAINT "OperationSourceClaim_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationGrant" ADD CONSTRAINT "OperationGrant_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
