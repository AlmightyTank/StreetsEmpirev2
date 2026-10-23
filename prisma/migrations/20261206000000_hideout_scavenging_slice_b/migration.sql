ALTER TABLE "RoundPlayer" ADD COLUMN "scavengedComponents" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "RoundPlayer" ADD COLUMN "scavengedCaches" JSONB NOT NULL DEFAULT '[]';
