-- Remove the 2.3.0 Empire Advisor entirely.
DROP TABLE IF EXISTS "AdvisorEvaluationEvent";
DROP TABLE IF EXISTS "AdvisorSuppression";
ALTER TABLE "AccountProfile" DROP COLUMN IF EXISTS "advisorPreferences";
