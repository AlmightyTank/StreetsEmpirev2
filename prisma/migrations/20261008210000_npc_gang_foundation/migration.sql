-- NPC gang foundation. The RoundPlayer row remains the seasonal crew body; this
-- table adds scheduler personality/state for server-run street crews.
CREATE TABLE "NpcGang" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "archetype" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "homeCityId" TEXT NOT NULL,
  "aggression" INTEGER NOT NULL,
  "ambition" INTEGER NOT NULL,
  "discipline" INTEGER NOT NULL,
  "nextActionAt" TIMESTAMP(3) NOT NULL,
  "lastActionAt" TIMESTAMP(3),
  "dormantUntil" TIMESTAMP(3),
  "memory" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NpcGang_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NpcGang_roundPlayerId_key" ON "NpcGang"("roundPlayerId");
CREATE INDEX "NpcGang_nextActionAt_idx" ON "NpcGang"("nextActionAt");
CREATE INDEX "NpcGang_homeCityId_tier_idx" ON "NpcGang"("homeCityId", "tier");

ALTER TABLE "NpcGang"
  ADD CONSTRAINT "NpcGang_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NpcGang"
  ADD CONSTRAINT "NpcGang_homeCityId_fkey"
  FOREIGN KEY ("homeCityId") REFERENCES "City"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NpcGang"
  ADD CONSTRAINT "NpcGang_traits_check" CHECK (
    "aggression" BETWEEN 0 AND 100
    AND "ambition" BETWEEN 0 AND 100
    AND "discipline" BETWEEN 0 AND 100
  ) NOT VALID;

ALTER TABLE "NpcGang"
  ADD CONSTRAINT "NpcGang_memory_object_check" CHECK (jsonb_typeof("memory") = 'object') NOT VALID;
