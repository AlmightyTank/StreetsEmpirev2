-- 0.7.0-F Armory preference.
ALTER TABLE "RoundPlayer"
ADD COLUMN "hideoutWeaponPriority" TEXT NOT NULL DEFAULT 'POWER';
