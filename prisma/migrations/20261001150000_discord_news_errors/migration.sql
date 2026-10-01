-- Why Discord refused a news post; admins resend it from the news panel.
ALTER TABLE "GameNews" ADD COLUMN "discordError" TEXT;

-- What the bot last reported about its news channel.
CREATE TABLE "DiscordBotStatus" (
    "id" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT,
    "problem" TEXT,

    CONSTRAINT "DiscordBotStatus_pkey" PRIMARY KEY ("id")
);
