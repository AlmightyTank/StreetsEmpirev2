-- Survey Phase E: mark the one-time player announcement fanout.
ALTER TABLE "Survey" ADD COLUMN "announcedAt" TIMESTAMP(3);

CREATE INDEX "Survey_status_announcedAt_idx"
ON "Survey"("status", "announcedAt");
