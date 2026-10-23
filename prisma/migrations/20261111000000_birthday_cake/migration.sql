-- Birthdays (docs/BIRTHDAYS.md): an opt-in cake on the name on the birthday itself.
ALTER TABLE "AccountProfile" ADD COLUMN "showBirthdayCake" BOOLEAN NOT NULL DEFAULT false;
