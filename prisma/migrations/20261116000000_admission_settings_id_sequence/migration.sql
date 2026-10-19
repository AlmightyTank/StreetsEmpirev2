-- AdmissionSettings.id defaulted to the constant 1, so a second round's settings
-- row collided with the first on the primary key. Give each row its own id.
CREATE SEQUENCE "AdmissionSettings_id_seq" AS INTEGER OWNED BY "AdmissionSettings"."id";
SELECT setval('"AdmissionSettings_id_seq"', COALESCE((SELECT MAX("id") FROM "AdmissionSettings"), 0) + 1, false);
ALTER TABLE "AdmissionSettings" ALTER COLUMN "id" SET DEFAULT nextval('"AdmissionSettings_id_seq"');
