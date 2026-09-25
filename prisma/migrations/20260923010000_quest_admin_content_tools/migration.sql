-- Quest Phase X: audited admin/content switches for favor effects.

CREATE TABLE "FavorContentSetting" (
  "id" TEXT NOT NULL,
  "rulesetId" TEXT NOT NULL,
  "rulesetVersion" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FavorContentSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FavorContentSetting_rulesetId_rulesetVersion_key_key"
  ON "FavorContentSetting"("rulesetId", "rulesetVersion", "key");

CREATE INDEX "FavorContentSetting_rulesetId_rulesetVersion_isEnabled_idx"
  ON "FavorContentSetting"("rulesetId", "rulesetVersion", "isEnabled");
