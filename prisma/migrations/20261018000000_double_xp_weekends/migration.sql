CREATE TABLE "DoubleXpWeekend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthKey" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "announceAt" TIMESTAMP(3) NOT NULL,
    "newsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoubleXpWeekend_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "GameNews" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DoubleXpWeekend_monthKey_key" ON "DoubleXpWeekend"("monthKey");
CREATE UNIQUE INDEX "DoubleXpWeekend_newsId_key" ON "DoubleXpWeekend"("newsId");
CREATE INDEX "DoubleXpWeekend_startsAt_endsAt_idx" ON "DoubleXpWeekend"("startsAt", "endsAt");
