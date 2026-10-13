-- Named gangs become durable random-encounter context, not accounts or RoundPlayers.
CREATE TABLE "EncounterGang" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bossName" TEXT NOT NULL,
    "crewName" TEXT NOT NULL,
    "crewTag" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "targeting" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'SCRUB',
    "homeCityId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "aggression" INTEGER NOT NULL,
    "ambition" INTEGER NOT NULL,
    "discipline" INTEGER NOT NULL,
    "momentum" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "wantedUntil" TIMESTAMP(3),
    "dormantUntil" TIMESTAMP(3),
    "migratedAt" TIMESTAMP(3),
    "lastActionAt" TIMESTAMP(3),
    "memory" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EncounterGang_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EncounterGangTurf" (
    "id" TEXT NOT NULL,
    "gangId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandonedAt" TIMESTAMP(3),
    CONSTRAINT "EncounterGangTurf_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EncounterGangGrudge" (
    "id" TEXT NOT NULL,
    "gangId" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "bountyClaimedAt" TIMESTAMP(3),
    "lastEncounterAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EncounterGangGrudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EncounterGang_roundId_slug_key" ON "EncounterGang"("roundId", "slug");
CREATE INDEX "EncounterGang_roundId_cityId_status_idx" ON "EncounterGang"("roundId", "cityId", "status");
CREATE INDEX "EncounterGang_roundId_wantedUntil_idx" ON "EncounterGang"("roundId", "wantedUntil");
CREATE UNIQUE INDEX "EncounterGangTurf_roundId_cityId_district_key" ON "EncounterGangTurf"("roundId", "cityId", "district");
CREATE INDEX "EncounterGangTurf_gangId_status_idx" ON "EncounterGangTurf"("gangId", "status");
CREATE UNIQUE INDEX "EncounterGangGrudge_gangId_roundPlayerId_key" ON "EncounterGangGrudge"("gangId", "roundPlayerId");
CREATE INDEX "EncounterGangGrudge_roundPlayerId_expiresAt_idx" ON "EncounterGangGrudge"("roundPlayerId", "expiresAt");

ALTER TABLE "EncounterGang" ADD CONSTRAINT "EncounterGang_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterGang" ADD CONSTRAINT "EncounterGang_homeCityId_fkey" FOREIGN KEY ("homeCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EncounterGang" ADD CONSTRAINT "EncounterGang_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EncounterGangTurf" ADD CONSTRAINT "EncounterGangTurf_gangId_fkey" FOREIGN KEY ("gangId") REFERENCES "EncounterGang"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterGangTurf" ADD CONSTRAINT "EncounterGangTurf_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterGangTurf" ADD CONSTRAINT "EncounterGangTurf_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EncounterGangGrudge" ADD CONSTRAINT "EncounterGangGrudge_gangId_fkey" FOREIGN KEY ("gangId") REFERENCES "EncounterGang"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterGangGrudge" ADD CONSTRAINT "EncounterGangGrudge_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stop every autonomous NPC actor. Historical rows remain readable until the
-- old round-report compatibility layer is removed.
UPDATE "Account" SET "isActive" = false WHERE "email" LIKE '%@npc.streets-empire.invalid';
