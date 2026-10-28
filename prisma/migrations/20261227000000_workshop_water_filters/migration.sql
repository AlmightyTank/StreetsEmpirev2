-- Remaining percent on each water filter. The count stays in scavengedComponents.
ALTER TABLE "RoundPlayer" ADD COLUMN "waterFilters" JSONB NOT NULL DEFAULT '[]';
