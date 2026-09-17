-- AlterTable
ALTER TABLE "Alliance" ADD COLUMN     "forumDiscussionId" TEXT,
ADD COLUMN     "forumError" TEXT,
ADD COLUMN     "forumPostStartedAt" TIMESTAMP(3);
