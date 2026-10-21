-- 2.5.0-A: stackable individual armory inventory and transactional summary.
CREATE TABLE "PlayerGun" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "name" TEXT,
  "condition" INTEGER NOT NULL DEFAULT 100,
  "mods" JSONB NOT NULL DEFAULT '[]',
  "lookKey" TEXT,
  "origin" JSONB NOT NULL DEFAULT '{}',
  "stats" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'READY',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "reserve" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerGun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerGun_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerGun_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "PlayerGun_condition_check" CHECK ("condition" BETWEEN 0 AND 100)
);
CREATE INDEX "PlayerGun_roundPlayerId_model_status_idx" ON "PlayerGun"("roundPlayerId", "model", "status");
CREATE INDEX "PlayerGun_roundPlayerId_condition_idx" ON "PlayerGun"("roundPlayerId", "condition");

CREATE TABLE "PlayerVehicle" (
  "id" TEXT NOT NULL,
  "roundPlayerId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "name" TEXT,
  "plate" TEXT,
  "condition" INTEGER NOT NULL DEFAULT 100,
  "mods" JSONB NOT NULL DEFAULT '[]',
  "lookKey" TEXT,
  "origin" JSONB NOT NULL DEFAULT '{}',
  "stats" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'READY',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerVehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerVehicle_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerVehicle_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "PlayerVehicle_condition_check" CHECK ("condition" BETWEEN 0 AND 100)
);
CREATE INDEX "PlayerVehicle_roundPlayerId_model_status_idx" ON "PlayerVehicle"("roundPlayerId", "model", "status");
CREATE INDEX "PlayerVehicle_roundPlayerId_condition_idx" ON "PlayerVehicle"("roundPlayerId", "condition");

CREATE TABLE "PlayerArmorySummary" (
  "roundPlayerId" TEXT NOT NULL,
  "pistolCount" INTEGER NOT NULL DEFAULT 0,
  "shotgunCount" INTEGER NOT NULL DEFAULT 0,
  "tek9Count" INTEGER NOT NULL DEFAULT 0,
  "ak47Count" INTEGER NOT NULL DEFAULT 0,
  "sedanCount" INTEGER NOT NULL DEFAULT 0,
  "lowRiderCount" INTEGER NOT NULL DEFAULT 0,
  "vanCount" INTEGER NOT NULL DEFAULT 0,
  "gunCount" INTEGER NOT NULL DEFAULT 0,
  "vehicleCount" INTEGER NOT NULL DEFAULT 0,
  "gunsCondition0To19" INTEGER NOT NULL DEFAULT 0,
  "gunsCondition20To39" INTEGER NOT NULL DEFAULT 0,
  "gunsCondition40To59" INTEGER NOT NULL DEFAULT 0,
  "gunsCondition60To79" INTEGER NOT NULL DEFAULT 0,
  "gunsCondition80To100" INTEGER NOT NULL DEFAULT 0,
  "vehiclesCondition0To19" INTEGER NOT NULL DEFAULT 0,
  "vehiclesCondition20To39" INTEGER NOT NULL DEFAULT 0,
  "vehiclesCondition40To59" INTEGER NOT NULL DEFAULT 0,
  "vehiclesCondition60To79" INTEGER NOT NULL DEFAULT 0,
  "vehiclesCondition80To100" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerArmorySummary_pkey" PRIMARY KEY ("roundPlayerId"),
  CONSTRAINT "PlayerArmorySummary_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
