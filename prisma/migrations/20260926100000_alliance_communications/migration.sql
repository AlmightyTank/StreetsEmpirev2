ALTER TABLE "Alliance" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Alliance" ADD COLUMN "recruitmentStatus" TEXT NOT NULL DEFAULT 'CLOSED';

ALTER TABLE "AllianceWirePost" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'MESSAGE';
ALTER TABLE "AllianceWirePost" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AllianceWirePost_allianceId_kind_pinned_createdAt_idx"
  ON "AllianceWirePost"("allianceId", "kind", "pinned", "createdAt" DESC);
