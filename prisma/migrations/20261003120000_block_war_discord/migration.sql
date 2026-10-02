-- 1.1.0-D: block war declarations and endings on the public Discord street feed.
-- AlterTable
ALTER TABLE "BlockWar" ADD COLUMN     "discordDeclaredPostedAt" TIMESTAMP(3),
ADD COLUMN     "discordEndedPostedAt" TIMESTAMP(3);

