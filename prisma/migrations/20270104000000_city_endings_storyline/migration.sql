CREATE TABLE "RoundStoryState" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "globalChapter" INTEGER NOT NULL DEFAULT 0,
    "globalProgress" INTEGER NOT NULL DEFAULT 0,
    "globalStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "globalResolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoundStoryState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CityStoryState" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "endingKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "requiredEvents" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CityStoryState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoundStoryState_roundId_key" ON "RoundStoryState"("roundId");
CREATE UNIQUE INDEX "CityStoryState_roundId_cityId_key" ON "CityStoryState"("roundId", "cityId");
CREATE INDEX "CityStoryState_roundId_status_idx" ON "CityStoryState"("roundId", "status");
ALTER TABLE "RoundStoryState" ADD CONSTRAINT "RoundStoryState_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CityStoryState" ADD CONSTRAINT "CityStoryState_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CityStoryState" ADD CONSTRAINT "CityStoryState_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
