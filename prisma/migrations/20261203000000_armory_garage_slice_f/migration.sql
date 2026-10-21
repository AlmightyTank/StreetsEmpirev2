ALTER TABLE "AccountProfile" ADD COLUMN "famousItem" JSONB;

ALTER TABLE "PlayerGun" ADD COLUMN "history" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "PlayerVehicle" ADD COLUMN "history" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "PlayerGun"
SET "history" = jsonb_build_array(jsonb_build_object(
  'at', to_jsonb("createdAt"), 'type', 'ACQUIRED', 'summary', 'Entered the armory'
));
UPDATE "PlayerVehicle"
SET "history" = jsonb_build_array(jsonb_build_object(
  'at', to_jsonb("createdAt"), 'type', 'ACQUIRED', 'summary', 'Entered the garage'
));
