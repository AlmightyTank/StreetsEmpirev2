-- 0.7.0-G permanent seasonal Hideout branch choices.
ALTER TABLE "RoundPlayer"
ADD COLUMN "hideoutSafeRoomSpecialization" TEXT,
ADD COLUMN "hideoutLookoutsSpecialization" TEXT,
ADD COLUMN "hideoutWorkshopSpecialization" TEXT,
ADD COLUMN "hideoutBackOfficeSpecialization" TEXT;
