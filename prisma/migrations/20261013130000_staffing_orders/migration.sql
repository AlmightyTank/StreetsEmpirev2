-- 1.8.6-H: standing staffing orders for persistent crew slots.
ALTER TYPE "CrewJobPostKind" ADD VALUE IF NOT EXISTS 'DEALER';
ALTER TYPE "CrewJobPostKind" ADD VALUE IF NOT EXISTS 'TURF';
