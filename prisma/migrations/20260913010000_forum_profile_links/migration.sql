CREATE TABLE "ForumLink" (
    "accountId" TEXT NOT NULL,
    "forumOrigin" TEXT NOT NULL,
    "forumUserId" TEXT NOT NULL,
    "forumUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumLink_pkey" PRIMARY KEY ("accountId")
);
CREATE UNIQUE INDEX "ForumLink_forumOrigin_forumUserId_key" ON "ForumLink"("forumOrigin", "forumUserId");
ALTER TABLE "ForumLink" ADD CONSTRAINT "ForumLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ForumLinkRequest" (
    "accountId" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ForumLinkRequest_pkey" PRIMARY KEY ("accountId")
);
CREATE UNIQUE INDEX "ForumLinkRequest_nonceHash_key" ON "ForumLinkRequest"("nonceHash");
ALTER TABLE "ForumLinkRequest" ADD CONSTRAINT "ForumLinkRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
