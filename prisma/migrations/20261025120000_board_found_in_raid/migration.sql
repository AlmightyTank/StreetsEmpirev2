ALTER TABLE "RoundPlayer" ADD COLUMN "foundInRaid" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "RoundPlayer" ADD COLUMN "playerBoardEscrowFoundInRaid" JSONB NOT NULL DEFAULT '{}';
