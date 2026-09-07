-- The existing rows are short-lived replay guards (10 minute TTL) whose
-- primary key WAS the client's action id. That id now lives in its own column,
-- scoped per player, so the old rows carry no value worth migrating.
DELETE FROM "ProcessedAction";

-- AlterTable
ALTER TABLE "ProcessedAction" ADD COLUMN     "actionId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedAction_roundPlayerId_actionId_key" ON "ProcessedAction"("roundPlayerId", "actionId");
