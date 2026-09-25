-- Quest phases C-G: tracked jobs and quest activity notifications.

ALTER TABLE "PlayerQuest"
  ADD COLUMN "isTracked" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "ActivityType" ADD VALUE 'QUEST_READY';
ALTER TYPE "ActivityType" ADD VALUE 'QUEST_CLAIMED';
