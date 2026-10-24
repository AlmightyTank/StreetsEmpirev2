-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'QUEST_STORY_SCENE';

-- CreateTable
CREATE TABLE "QuestSceneResponse" (
    "id" TEXT NOT NULL,
    "playerQuestId" TEXT NOT NULL,
    "sceneKey" TEXT NOT NULL,
    "responseKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestSceneResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestSceneResponse_playerQuestId_sceneKey_key" ON "QuestSceneResponse"("playerQuestId", "sceneKey");

-- AddForeignKey
ALTER TABLE "QuestSceneResponse" ADD CONSTRAINT "QuestSceneResponse_playerQuestId_fkey" FOREIGN KEY ("playerQuestId") REFERENCES "PlayerQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

