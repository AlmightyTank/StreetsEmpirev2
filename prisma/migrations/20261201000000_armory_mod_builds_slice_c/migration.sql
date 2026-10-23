CREATE TABLE "PlayerArmoryBuild" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mods" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerArmoryBuild_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerArmoryBuild_roundPlayerId_kind_model_nameNormalized_key"
ON "PlayerArmoryBuild"("roundPlayerId", "kind", "model", "nameNormalized");

CREATE INDEX "PlayerArmoryBuild_roundPlayerId_kind_model_idx"
ON "PlayerArmoryBuild"("roundPlayerId", "kind", "model");

ALTER TABLE "PlayerArmoryBuild"
ADD CONSTRAINT "PlayerArmoryBuild_roundPlayerId_fkey"
FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
