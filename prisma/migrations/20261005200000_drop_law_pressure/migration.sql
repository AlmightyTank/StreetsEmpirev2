-- StreetsEmpire 1.3.0: withdraw the law-pressure draft (20261004132000_law_pressure).
-- The Case (1.3.0-A to E) is the 1.3 law system, so the per-player attention and evidence
-- columns are dropped. The LAW_CORRUPTION activity value stays, since Postgres cannot drop an
-- enum value in place and older activity rows may use it.

-- AlterTable
ALTER TABLE "RoundPlayer" DROP COLUMN IF EXISTS "lawAttention",
DROP COLUMN IF EXISTS "lawEvidence";
