-- Bug reports: where they came from, words for the reporter, and the resolution notice.
ALTER TABLE "BugReport"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'GAME',
ADD COLUMN "playerReply" TEXT,
ADD COLUMN "reporterNotifiedAt" TIMESTAMP(3);

-- Reports resolved before notices existed never send one.
UPDATE "BugReport" SET "reporterNotifiedAt" = "resolvedAt" WHERE "resolvedAt" IS NOT NULL;

-- What the Discord bot posts to the staff channel.
CREATE TABLE "DiscordStaffPost" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "messageId" TEXT,
    "error" TEXT,

    CONSTRAINT "DiscordStaffPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscordStaffPost_claimedAt_createdAt_idx" ON "DiscordStaffPost"("claimedAt", "createdAt");
CREATE INDEX "DiscordStaffPost_kind_targetId_idx" ON "DiscordStaffPost"("kind", "targetId");
