-- Existing beta databases may already have applied the original Discord news sync.
-- Add edit leases in a new migration instead of changing that migration's checksum.
ALTER TABLE "GameNews" ADD COLUMN "discordEditClaimedAt" TIMESTAMP(3);
