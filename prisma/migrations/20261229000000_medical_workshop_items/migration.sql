-- Field first-aid kits and rag dressings are distinct treatment supplies.
ALTER TABLE "RoundPlayer" ADD COLUMN "fieldFirstAidKits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RoundPlayer" ADD COLUMN "ragDressings" INTEGER NOT NULL DEFAULT 0;
