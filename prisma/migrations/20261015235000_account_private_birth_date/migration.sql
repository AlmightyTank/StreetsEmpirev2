-- Store the account owner's date of birth privately for the new 16+ minimum age.
-- Existing accounts remain null and must submit a birthday after sign-in.
ALTER TABLE "Account" ADD COLUMN "birthDate" DATE;
