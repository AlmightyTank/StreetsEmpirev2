-- 1.6.0-I. Audited staff corrections to stored and crew stock are movements too.
ALTER TYPE "SupplyMovementKind" ADD VALUE IF NOT EXISTS 'CORRECTED';
