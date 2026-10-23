CREATE TABLE "AdvisorEvaluationEvent" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "suggestionKey" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "focus" TEXT NOT NULL,
  "rulesetVersion" TEXT NOT NULL,
  "sourceFingerprint" TEXT,
  "outcome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvisorEvaluationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdvisorEvaluationEvent_accountId_roundId_suggestionKey_event_idx" ON "AdvisorEvaluationEvent"("accountId", "roundId", "suggestionKey", "event");
CREATE INDEX "AdvisorEvaluationEvent_roundId_createdAt_idx" ON "AdvisorEvaluationEvent"("roundId", "createdAt");
ALTER TABLE "AdvisorEvaluationEvent" ADD CONSTRAINT "AdvisorEvaluationEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorEvaluationEvent" ADD CONSTRAINT "AdvisorEvaluationEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
