-- CreateTable
CREATE TABLE "AllianceWirePost" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedByName" TEXT,
    "removedByRole" TEXT,
    "removedReason" TEXT,

    CONSTRAINT "AllianceWirePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerContact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllianceWirePost_allianceId_createdAt_idx" ON "AllianceWirePost"("allianceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AllianceWirePost_authorId_createdAt_idx" ON "AllianceWirePost"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlayerContact_ownerId_updatedAt_idx" ON "PlayerContact"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerContact_ownerId_targetId_key" ON "PlayerContact"("ownerId", "targetId");

-- AddForeignKey
ALTER TABLE "AllianceWirePost" ADD CONSTRAINT "AllianceWirePost_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceWirePost" ADD CONSTRAINT "AllianceWirePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerContact" ADD CONSTRAINT "PlayerContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerContact" ADD CONSTRAINT "PlayerContact_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
