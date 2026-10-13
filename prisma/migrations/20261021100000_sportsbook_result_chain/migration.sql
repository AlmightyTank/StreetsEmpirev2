-- Slice D: retain an explicit, queryable reason when result evidence needs staff review.
ALTER TABLE "SportsbookEvent"
  ADD COLUMN "resultReviewReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "resultReviewAt" TIMESTAMP(3);

CREATE INDEX "SportsbookEvent_resultReviewAt_idx" ON "SportsbookEvent"("resultReviewAt");
